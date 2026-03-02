import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { isReadApiAuthorized } from '$lib/auth';

export const GET: RequestHandler = async ({ request, url }) => {
  const apiSecret = process.env.API_AUTH_SECRET;
  if (!isReadApiAuthorized(request, url, apiSecret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  const [counts] = await db`
    SELECT
      (SELECT COUNT(*) FROM repositories) as total,
      (SELECT COUNT(*) FROM repo_health_scores WHERE health_score >= 75) as healthy,
      (SELECT COUNT(DISTINCT repo_id) FROM audit_flags WHERE resolved_at IS NULL) as needs_attention
  `;

  const byFlag = await db`
    SELECT af.flag_type, COUNT(*) as count, array_agg(r.full_name) as repos
    FROM audit_flags af
    JOIN repositories r ON r.id = af.repo_id
    WHERE af.resolved_at IS NULL
    GROUP BY af.flag_type
  `;

  const total = Number(counts?.total ?? 0) || 0;
  const healthyCount = Number(counts?.healthy ?? 0) || 0;
  const needsAttentionCount = Number(counts?.needs_attention ?? 0) || 0;

  return json({
    total,
    healthy: healthyCount,
    needs_attention: needsAttentionCount,
    flags: byFlag.map((f) => ({
      flag_type: f.flag_type,
      count: Number(f.count),
      repos: f.repos || []
    }))
  });
};
