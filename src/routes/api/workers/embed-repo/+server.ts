import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { getEmbedding } from '$lib/ai/embeddings';
import { chunkText } from '$lib/ai/chunking';
import { enqueueSummarizeRepo } from '$lib/qstash';
import { isBearerAuthorized } from '$lib/auth';
import { RECONCILE_CRON_SECRET } from '$env/static/private';

export const POST: RequestHandler = async ({ request }) => {
  const workerSecret = process.env.WORKER_AUTH_SECRET || RECONCILE_CRON_SECRET;
  if (!isBearerAuthorized(request, workerSecret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { repoId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { repoId } = body;
  if (!repoId) return json({ error: 'repoId required' }, { status: 400 });

  const db = getDb();

  const [repo] = await db`
    SELECT id, full_name, default_branch FROM repositories WHERE id = ${repoId} LIMIT 1
  `;
  if (!repo) return json({ error: 'Repo not found' }, { status: 404 });

  await db`DELETE FROM repo_embeddings WHERE repo_id = ${repoId}`;

  const files = await db`
    SELECT id, path, content FROM repo_files
    WHERE repo_id = ${repoId} AND content IS NOT NULL AND content != ''
  `;

  for (const file of files) {
    const chunks = chunkText(file.content);
    for (let i = 0; i < chunks.length; i++) {
      const { chunk } = chunks[i];
      if (chunk.length < 50) continue;

      const embedding = await getEmbedding(chunk);
      const embeddingStr = `[${embedding.join(',')}]`;

      await db`
        INSERT INTO repo_embeddings (repo_id, file_id, chunk_index, content_chunk, embedding, file_path, token_count)
        VALUES (
          ${repoId},
          ${file.id},
          ${i},
          ${chunk.slice(0, 10000)},
          ${embeddingStr}::vector,
          ${file.path},
          ${Math.ceil(chunk.length / 4)}
        )
      `;
    }
  }

  try {
    await enqueueSummarizeRepo(repoId);
  } catch (queueError) {
    console.error('Embed worker: enqueue summarize failed for repo', repo.full_name, queueError);
  }
  return json({ ok: true, repoId, chunks: files.reduce((a, f) => a + chunkText(f.content).length, 0) });
};
