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
  const ownerTeam = url.searchParams.get('owner_team')?.trim() || null;
  const lifecycle = url.searchParams.get('lifecycle')?.trim() || null;
  const techStack = url.searchParams.get('tech_stack')?.trim() || null;
  const domain = url.searchParams.get('domain')?.trim() || null;

  const repos = await db`
    SELECT r.id, r.name, r.full_name, r.url, r.archived, r.default_branch, r.updated_at as last_sync_at,
           rm.description, rm.last_commit_at, rm.language_stats,
           rs.problem_summary, rs.tech_stack_detected,
           rhs.has_readme, rhs.has_codeowners, rhs.health_score, rhs.last_active_days
    FROM repositories r
    CROSS JOIN (
      SELECT
        ${ownerTeam}::text AS owner_team,
        ${lifecycle}::text AS lifecycle,
        ${techStack}::text AS tech_stack,
        ${domain}::text AS domain
    ) p
    LEFT JOIN repo_metadata rm ON rm.repo_id = r.id
    LEFT JOIN repo_summaries rs ON rs.repo_id = r.id
    LEFT JOIN repo_health_scores rhs ON rhs.repo_id = r.id
    WHERE
      (p.owner_team IS NULL OR EXISTS (
        SELECT 1
        FROM repo_custom_properties cp
        WHERE cp.repo_id = r.id
          AND cp.key = 'owner_team'
          AND lower(cp.value) = lower(p.owner_team)
      ))
      AND (p.lifecycle IS NULL OR EXISTS (
        SELECT 1
        FROM repo_custom_properties cp
        WHERE cp.repo_id = r.id
          AND cp.key = 'lifecycle'
          AND lower(cp.value) = lower(p.lifecycle)
      ))
      AND (p.domain IS NULL OR EXISTS (
        SELECT 1
        FROM repo_custom_properties cp
        CROSS JOIN LATERAL unnest(string_to_array(lower(cp.value), ',')) AS d(raw_domain)
        WHERE cp.repo_id = r.id
          AND cp.key = 'domain'
          AND btrim(d.raw_domain) LIKE '%' || lower(p.domain) || '%'
      ))
      AND (
        p.tech_stack IS NULL
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(rs.tech_stack_detected, '[]'::jsonb)) AS t(stack_item)
          WHERE lower(t.stack_item) LIKE '%' || lower(p.tech_stack) || '%'
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_object_keys(COALESCE(rm.language_stats, '{}'::jsonb)) AS l(language_name)
          WHERE lower(l.language_name) LIKE '%' || lower(p.tech_stack) || '%'
        )
      )
    ORDER BY r.updated_at DESC
  `;
  return json(repos);
};
