import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { isReadApiAuthorized } from '$lib/auth';

export const GET: RequestHandler = async ({ params, request, url }) => {
  const apiSecret = process.env.API_AUTH_SECRET;
  if (!isReadApiAuthorized(request, url, apiSecret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const id = params.id;

  const [repo] = await db`
    SELECT r.*, rm.description, rm.language_stats, rm.last_commit_at,
           rs.ai_summary, rs.arch_summary, rs.problem_summary, rs.tech_stack_detected,
           rhs.has_readme, rhs.has_codeowners, rhs.has_arch_doc, rhs.health_score, rhs.last_active_days
    FROM repositories r
    LEFT JOIN repo_metadata rm ON rm.repo_id = r.id
    LEFT JOIN repo_summaries rs ON rs.repo_id = r.id
    LEFT JOIN repo_health_scores rhs ON rhs.repo_id = r.id
    WHERE r.id = ${id}
    LIMIT 1
  `;

  if (!repo) return json({ error: 'Not found' }, { status: 404 });

  const [props] = await db`
    SELECT json_object_agg(key, value) as props FROM repo_custom_properties WHERE repo_id = ${id}
  `;
  const custom_properties = props?.props ? Object.entries(props.props).map(([k, v]) => ({ key: k, value: v })) : [];

  const flags = await db`
    SELECT id, flag_type, severity, details, detected_at FROM audit_flags
    WHERE repo_id = ${id} AND resolved_at IS NULL
  `;

  const keyFiles = await db`
    SELECT path FROM repo_files WHERE repo_id = ${id}
    AND path IN ('README.md', 'CODEOWNERS', 'docs/architecture.md', 'package.json', 'requirements.txt', 'Dockerfile')
    LIMIT 10
  `;

  const baseUrl = `https://github.com/${repo.full_name}/blob/${repo.default_branch || 'main'}`;

  return json({
    ...repo,
    custom_properties,
    audit_flags: flags,
    key_files: keyFiles.map((f) => ({ path: f.path, url: `${baseUrl}/${f.path}` }))
  });
};
