import type { RepoFilters } from '../types';

export interface RepoFile {
  id: string;
  path: string;
  file_type: string | null;
}

export function buildReposQuery(filters: RepoFilters) {
  let where = '1=1';
  const params: string[] = [];
  let i = 1;

  if (filters.owner_team) {
    where += ` AND EXISTS (SELECT 1 FROM repo_custom_properties rcp WHERE rcp.repo_id = r.id AND rcp.key = 'owner_team' AND rcp.value = $${i})`;
    params.push(filters.owner_team);
    i++;
  }
  if (filters.lifecycle) {
    where += ` AND EXISTS (SELECT 1 FROM repo_custom_properties rcp2 WHERE rcp2.repo_id = r.id AND rcp2.key = 'lifecycle' AND rcp2.value = $${i})`;
    params.push(filters.lifecycle);
    i++;
  }
  if (filters.tech_stack) {
    where += ` AND EXISTS (SELECT 1 FROM repo_summaries rs WHERE rs.repo_id = r.id AND rs.tech_stack_detected::text ILIKE $${i})`;
    params.push(`%${filters.tech_stack}%`);
    i++;
  }
  if (filters.domain) {
    where += ` AND EXISTS (SELECT 1 FROM repo_custom_properties rcp3 WHERE rcp3.repo_id = r.id AND rcp3.key = 'domain' AND rcp3.value = $${i})`;
    params.push(filters.domain);
  }

  return { where, params };
}
