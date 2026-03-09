import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { calculateSecurityScore } from '$lib/intelligence';
import { ensureSecuritySuppressionTable } from '$lib/db/securitySuppressions';

export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;
  const db = getDb();
  await ensureSecuritySuppressionTable(db);

  const [repo] = await db`
    SELECT id, name, full_name, url FROM repositories WHERE id = ${id} LIMIT 1
  `;

  if (!repo) return json({ error: 'Repo not found' }, { status: 404 });

  const vulnerabilities = await db`
    SELECT v.alert_number, v.cve_id, v.package_name, v.severity, v.state, v.summary, v.url, v.detected_at, v.resolved_at
    FROM repo_vulnerabilities v
    LEFT JOIN repo_security_suppressions s
      ON s.repo_id = v.repo_id
      AND s.alert_type = 'vulnerability'
      AND s.alert_number = v.alert_number
    WHERE v.repo_id = ${id}
      AND s.id IS NULL
    ORDER BY
      CASE v.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      v.detected_at DESC
  `;

  const secrets = await db`
    SELECT s.alert_number, s.secret_type, s.state, s.resolution, s.url, s.detected_at
    FROM repo_secrets_alerts s
    LEFT JOIN repo_security_suppressions sup
      ON sup.repo_id = s.repo_id
      AND sup.alert_type = 'secret'
      AND sup.alert_number = s.alert_number
    WHERE s.repo_id = ${id}
      AND sup.id IS NULL
    ORDER BY s.detected_at DESC
  `;

  const [scanJob] = await db`
    SELECT status, last_run, error FROM security_scan_jobs WHERE repo_id = ${id} LIMIT 1
  `;

  const openVulns = vulnerabilities.filter((v) => v.state === 'open');
  const counts = {
    critical: openVulns.filter((v) => v.severity === 'critical').length,
    high: openVulns.filter((v) => v.severity === 'high').length,
    medium: openVulns.filter((v) => v.severity === 'medium').length,
    low: openVulns.filter((v) => v.severity === 'low').length,
    secrets: secrets.filter((s) => s.state === 'open').length
  };
  const score = calculateSecurityScore(counts);

  return json({
    repo_id: id,
    security_score: score,
    vulnerability_count_critical: counts.critical,
    vulnerability_count_high: counts.high,
    vulnerability_count_medium: counts.medium,
    vulnerability_count_low: counts.low,
    open_secret_alerts: counts.secrets,
    last_scanned_at: scanJob?.last_run ?? null,
    scan_status: scanJob?.status ?? null,
    vulnerabilities,
    secrets
  });
};
