import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { calculateSecurityScore } from '$lib/intelligence';
import { ensureSecuritySuppressionTable } from '$lib/db/securitySuppressions';
import { isReadApiAuthorized } from '$lib/auth';

type ResolvePayload = {
  alertType?: 'vulnerability' | 'secret';
  alertNumber?: number;
  reason?: string;
};

export const POST: RequestHandler = async ({ params, request, url }) => {
  const apiSecret = process.env.API_AUTH_SECRET;
  if (!isReadApiAuthorized(request, url, apiSecret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ResolvePayload;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const repoId = params.id;
  const alertType = body.alertType;
  const alertNumber = Number(body.alertNumber);
  const reason = (body.reason || '').trim();

  if (!alertType || !['vulnerability', 'secret'].includes(alertType)) {
    return json({ error: 'alertType must be vulnerability or secret' }, { status: 400 });
  }
  if (!Number.isInteger(alertNumber) || alertNumber <= 0) {
    return json({ error: 'alertNumber must be a positive integer' }, { status: 400 });
  }

  const db = getDb();
  await ensureSecuritySuppressionTable(db);
  const [repo] = await db`SELECT id FROM repositories WHERE id = ${repoId} LIMIT 1`;
  if (!repo) return json({ error: 'Repo not found' }, { status: 404 });

  try {
    await db`
      INSERT INTO repo_security_suppressions (
        repo_id, alert_type, alert_number, source_state, resolution_reason
      ) VALUES (
        ${repoId}, ${alertType}, ${alertNumber}, 'open', ${reason || null}
      )
      ON CONFLICT (repo_id, alert_type, alert_number) DO UPDATE SET
        source_state = EXCLUDED.source_state,
        resolution_reason = EXCLUDED.resolution_reason
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      {
        error:
          `Failed to persist resolution. Ensure latest DB schema is applied. Details: ${message}`
      },
      { status: 500 }
    );
  }

  if (alertType === 'vulnerability') {
    await db`DELETE FROM repo_vulnerabilities WHERE repo_id = ${repoId} AND alert_number = ${alertNumber}`;
  } else {
    await db`DELETE FROM repo_secrets_alerts WHERE repo_id = ${repoId} AND alert_number = ${alertNumber}`;
  }

  const vulnerabilities = await db`
    SELECT severity, state
    FROM repo_vulnerabilities
    WHERE repo_id = ${repoId} AND state = 'open'
  `;
  const secrets = await db`
    SELECT state
    FROM repo_secrets_alerts
    WHERE repo_id = ${repoId} AND state = 'open'
  `;

  const counts = {
    critical: vulnerabilities.filter((v) => v.severity === 'critical').length,
    high: vulnerabilities.filter((v) => v.severity === 'high').length,
    medium: vulnerabilities.filter((v) => v.severity === 'medium').length,
    low: vulnerabilities.filter((v) => v.severity === 'low').length,
    secrets: secrets.length
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
      security_score = EXCLUDED.security_score
  `;

  return json({ ok: true, repoId, alertType, alertNumber, counts, score });
};

