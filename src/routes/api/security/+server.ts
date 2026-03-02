import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';

export const GET: RequestHandler = async () => {
  const db = getDb();

  // Org-wide totals
  const [totals] = await db`
    SELECT
      COALESCE(SUM(vulnerability_count_critical), 0) AS total_critical,
      COALESCE(SUM(vulnerability_count_high), 0)     AS total_high,
      COALESCE(SUM(vulnerability_count_medium), 0)   AS total_medium,
      COALESCE(SUM(vulnerability_count_low), 0)      AS total_low,
      COALESCE(SUM(open_secret_alerts), 0)           AS total_secrets,
      COUNT(*)                                        AS repos_scanned
    FROM repo_security_scores
  `;

  // Repos with any critical or high vulnerability
  const atRiskRepos = await db`
    SELECT
      r.id,
      r.name,
      r.full_name,
      r.url,
      s.security_score,
      s.vulnerability_count_critical,
      s.vulnerability_count_high,
      s.vulnerability_count_medium,
      s.vulnerability_count_low,
      s.open_secret_alerts,
      s.last_scanned_at
    FROM repo_security_scores s
    JOIN repositories r ON r.id = s.repo_id
    WHERE s.security_score < 100
    ORDER BY s.security_score ASC, s.vulnerability_count_critical DESC
    LIMIT 50
  `;

  // Count repos with secret alerts open
  const [secretCount] = await db`
    SELECT COUNT(DISTINCT repo_id) AS repos_with_secrets
    FROM repo_secrets_alerts
    WHERE state = 'open'
  `;

  // Count repos with critical alerts open
  const [criticalCount] = await db`
    SELECT COUNT(DISTINCT repo_id) AS repos_with_critical
    FROM repo_vulnerabilities
    WHERE severity = 'critical' AND state = 'open'
  `;

  return json({
    totals: {
      critical: Number(totals?.total_critical ?? 0),
      high: Number(totals?.total_high ?? 0),
      medium: Number(totals?.total_medium ?? 0),
      low: Number(totals?.total_low ?? 0),
      secrets: Number(totals?.total_secrets ?? 0),
      repos_scanned: Number(totals?.repos_scanned ?? 0)
    },
    repos_with_critical: Number(criticalCount?.repos_with_critical ?? 0),
    repos_with_secrets: Number(secretCount?.repos_with_secrets ?? 0),
    at_risk_repos: atRiskRepos
  });
};
