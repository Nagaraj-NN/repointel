import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { getInstallationToken, fetchDependabotAlerts, fetchSecretScanningAlerts } from '$lib/github';
import { calculateSecurityScore } from '$lib/intelligence';
import { isBearerAuthorized } from '$lib/auth';
import { ensureSecuritySuppressionTable } from '$lib/db/securitySuppressions';
import { RECONCILE_CRON_SECRET } from '$env/static/private';

export const POST: RequestHandler = async ({ request }) => {
  const workerSecret = process.env.WORKER_AUTH_SECRET || RECONCILE_CRON_SECRET;
  if (!isBearerAuthorized(request, workerSecret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { repoId?: string; fullName?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { repoId, fullName } = body;
  if (!repoId || !fullName) {
    return json({ error: 'repoId and fullName required' }, { status: 400 });
  }

  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) {
    return json({ error: 'Invalid fullName' }, { status: 400 });
  }

  const db = getDb();
  await ensureSecuritySuppressionTable(db);

  const [orgRow] = await db`
    SELECT o.install_id FROM repositories r
    JOIN organizations o ON r.org_id = o.id
    WHERE r.id = ${repoId}
    LIMIT 1
  `;

  if (!orgRow?.install_id) {
    return json({ error: 'Org not found' }, { status: 404 });
  }

  // Track job as running
  await db`
    INSERT INTO security_scan_jobs (repo_id, status, last_run)
    VALUES (${repoId}, 'running', NOW())
    ON CONFLICT DO NOTHING
  `;

  try {
    const token = await getInstallationToken(orgRow.install_id);

    const [vulnAlertsRaw, secretAlertsRaw] = await Promise.all([
      fetchDependabotAlerts(token, owner, repo),
      fetchSecretScanningAlerts(token, owner, repo)
    ]);

    const suppressions = await db`
      SELECT alert_type, alert_number
      FROM repo_security_suppressions
      WHERE repo_id = ${repoId}
    `;
    const suppressionKeys = new Set(
      suppressions.map((s) => `${s.alert_type}:${Number(s.alert_number)}`)
    );
    const vulnAlerts = vulnAlertsRaw.filter(
      (a) => !suppressionKeys.has(`vulnerability:${Number(a.alert_number)}`)
    );
    const secretAlerts = secretAlertsRaw.filter(
      (a) => !suppressionKeys.has(`secret:${Number(a.alert_number)}`)
    );

    // Replace all vulnerability rows for this repo
    await db`DELETE FROM repo_vulnerabilities WHERE repo_id = ${repoId}`;
    for (const alert of vulnAlerts) {
      await db`
        INSERT INTO repo_vulnerabilities (
          repo_id, alert_number, cve_id, package_name, severity, state,
          summary, url, detected_at, resolved_at
        ) VALUES (
          ${repoId}, ${alert.alert_number}, ${alert.cve_id}, ${alert.package_name},
          ${alert.severity}, ${alert.state}, ${alert.summary}, ${alert.url},
          ${alert.detected_at}, ${alert.resolved_at}
        )
        ON CONFLICT (repo_id, alert_number) DO UPDATE SET
          cve_id = EXCLUDED.cve_id,
          package_name = EXCLUDED.package_name,
          severity = EXCLUDED.severity,
          state = EXCLUDED.state,
          summary = EXCLUDED.summary,
          url = EXCLUDED.url,
          detected_at = EXCLUDED.detected_at,
          resolved_at = EXCLUDED.resolved_at
      `;
    }

    // Replace all secret alert rows for this repo
    await db`DELETE FROM repo_secrets_alerts WHERE repo_id = ${repoId}`;
    for (const alert of secretAlerts) {
      await db`
        INSERT INTO repo_secrets_alerts (
          repo_id, alert_number, secret_type, state, resolution, url, detected_at
        ) VALUES (
          ${repoId}, ${alert.alert_number}, ${alert.secret_type}, ${alert.state},
          ${alert.resolution}, ${alert.url}, ${alert.detected_at}
        )
        ON CONFLICT (repo_id, alert_number) DO UPDATE SET
          secret_type = EXCLUDED.secret_type,
          state = EXCLUDED.state,
          resolution = EXCLUDED.resolution,
          url = EXCLUDED.url,
          detected_at = EXCLUDED.detected_at
      `;
    }

    // Compute counts for open alerts only
    const openVulns = vulnAlerts.filter((a) => a.state === 'open');
    const counts = {
      critical: openVulns.filter((a) => a.severity === 'critical').length,
      high: openVulns.filter((a) => a.severity === 'high').length,
      medium: openVulns.filter((a) => a.severity === 'medium').length,
      low: openVulns.filter((a) => a.severity === 'low').length,
      secrets: secretAlerts.filter((a) => a.state === 'open').length
    };

    const score = calculateSecurityScore(counts);

    await db`
      INSERT INTO repo_security_scores (
        repo_id, vulnerability_count_critical, vulnerability_count_high,
        vulnerability_count_medium, vulnerability_count_low, open_secret_alerts,
        security_score, last_scanned_at
      ) VALUES (
        ${repoId}, ${counts.critical}, ${counts.high}, ${counts.medium},
        ${counts.low}, ${counts.secrets}, ${score}, NOW()
      )
      ON CONFLICT (repo_id) DO UPDATE SET
        vulnerability_count_critical = EXCLUDED.vulnerability_count_critical,
        vulnerability_count_high = EXCLUDED.vulnerability_count_high,
        vulnerability_count_medium = EXCLUDED.vulnerability_count_medium,
        vulnerability_count_low = EXCLUDED.vulnerability_count_low,
        open_secret_alerts = EXCLUDED.open_secret_alerts,
        security_score = EXCLUDED.security_score,
        last_scanned_at = NOW()
    `;

    await db`
      INSERT INTO security_scan_jobs (repo_id, status, last_run)
      VALUES (${repoId}, 'completed', NOW())
      ON CONFLICT DO NOTHING
    `;
    await db`
      UPDATE security_scan_jobs SET status = 'completed', last_run = NOW()
      WHERE repo_id = ${repoId}
    `;

    return json({ ok: true, repoId, score, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db`
      UPDATE security_scan_jobs SET status = 'failed', error = ${message}, last_run = NOW()
      WHERE repo_id = ${repoId}
    `;
    console.error('scan-repo worker failed:', fullName, err);
    return json({ error: message }, { status: 500 });
  }
};
