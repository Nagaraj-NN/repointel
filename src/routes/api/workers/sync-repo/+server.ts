import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { getInstallationToken, fetchRepoData } from '$lib/github';
import { enqueueEmbedRepo } from '$lib/qstash';
import { isBearerAuthorized } from '$lib/auth';
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

  const [orgRow] = await db`
    SELECT o.install_id FROM repositories r
    JOIN organizations o ON r.org_id = o.id
    WHERE r.id = ${repoId}
    LIMIT 1
  `;

  if (!orgRow?.install_id) {
    return json({ error: 'Org not found' }, { status: 404 });
  }

  const token = await getInstallationToken(orgRow.install_id);
  const data = await fetchRepoData(token, owner, repo);

  await db`
    UPDATE repositories SET
      name = ${data.repo.name},
      full_name = ${data.repo.full_name},
      url = ${data.repo.url},
      default_branch = ${data.repo.default_branch || 'main'},
      archived = ${data.repo.archived},
      updated_at = NOW()
    WHERE id = ${repoId}
  `;

  await db`
    INSERT INTO repo_metadata (repo_id, description, language_stats, last_commit_at, star_count, fork_count)
    VALUES (
      ${repoId},
      ${data.metadata.description},
      ${JSON.stringify(data.metadata.language_stats)},
      ${data.metadata.last_commit_at},
      ${data.metadata.star_count},
      ${data.metadata.fork_count}
    )
    ON CONFLICT (repo_id) DO UPDATE SET
      description = EXCLUDED.description,
      language_stats = EXCLUDED.language_stats,
      last_commit_at = EXCLUDED.last_commit_at,
      star_count = EXCLUDED.star_count,
      fork_count = EXCLUDED.fork_count,
      updated_at = NOW()
  `;

  if (data.readme) {
    await db`
      INSERT INTO repo_files (repo_id, path, content, file_type)
      VALUES (${repoId}, 'README.md', ${data.readme}, 'readme')
      ON CONFLICT (repo_id, path) DO UPDATE SET content = EXCLUDED.content, last_updated = NOW()
    `;
    await db`
      INSERT INTO repo_docs (repo_id, doc_type, content, path)
      VALUES (${repoId}, 'README', ${data.readme}, 'README.md')
      ON CONFLICT (repo_id, doc_type) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
    `;
  }

  if (data.codeowners) {
    await db`
      INSERT INTO repo_files (repo_id, path, content, file_type)
      VALUES (${repoId}, 'CODEOWNERS', ${data.codeowners}, 'codeowners')
      ON CONFLICT (repo_id, path) DO UPDATE SET content = EXCLUDED.content, last_updated = NOW()
    `;
  }

  for (const doc of data.docs) {
    const docType = doc.path.includes('architecture') ? 'architecture' : 'other';
    await db`
      INSERT INTO repo_files (repo_id, path, content, file_type)
      VALUES (${repoId}, ${doc.path}, ${doc.content}, 'doc')
      ON CONFLICT (repo_id, path) DO UPDATE SET content = EXCLUDED.content, last_updated = NOW()
    `;
    await db`
      INSERT INTO repo_docs (repo_id, doc_type, content, path)
      VALUES (${repoId}, ${docType}, ${doc.content}, ${doc.path})
      ON CONFLICT (repo_id, doc_type) DO UPDATE SET content = EXCLUDED.content, path = EXCLUDED.path, updated_at = NOW()
    `;
  }

  // Refresh custom properties used by filters (owner_team, lifecycle, domain, etc.)
  await db`DELETE FROM repo_custom_properties WHERE repo_id = ${repoId}`;
  for (const [key, value] of Object.entries(data.custom_properties || {})) {
    await db`
      INSERT INTO repo_custom_properties (repo_id, key, value)
      VALUES (${repoId}, ${key}, ${value})
      ON CONFLICT (repo_id, key) DO UPDATE SET value = EXCLUDED.value
    `;
  }

  try {
    await enqueueEmbedRepo(repoId);
  } catch (queueError) {
    console.error('Sync worker: enqueue embed failed for repo', fullName, queueError);
  }
  return json({ ok: true, repoId });
};
