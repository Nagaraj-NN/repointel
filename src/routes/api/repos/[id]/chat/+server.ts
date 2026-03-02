import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { getEmbedding } from '$lib/ai/embeddings';
import { chat, RAG_SYSTEM_PROMPT } from '$lib/ai/llm';
import { isReadApiAuthorized } from '$lib/auth';

export const POST: RequestHandler = async ({ params, request, url }) => {
  const apiSecret = process.env.API_AUTH_SECRET;
  if (!isReadApiAuthorized(request, url, apiSecret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) return json({ error: 'message required' }, { status: 400 });

  const db = getDb();
  const repoId = params.id;

  const [repo] = await db`SELECT id, full_name, default_branch FROM repositories WHERE id = ${repoId} LIMIT 1`;
  if (!repo) return json({ error: 'Repo not found' }, { status: 404 });

  const queryEmbedding = await getEmbedding(message);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const chunks = await db`
    SELECT content_chunk, file_path, repo_id
    FROM repo_embeddings
    WHERE repo_id = ${repoId}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT 10
  `;

  const baseUrl = `https://github.com/${repo.full_name}/blob/${repo.default_branch}`;
  const context = chunks
    .map(
      (c) =>
        `[${c.file_path}](${baseUrl}/${c.file_path})\n${c.content_chunk}`
    )
    .join('\n\n---\n\n');

  const systemPrompt = `${RAG_SYSTEM_PROMPT}\n\nContext from repository ${repo.full_name}:\n\n${context || 'No relevant context found.'}`;

  const answer = await chat([{ role: 'user', content: message }], systemPrompt);

  const citations = chunks.slice(0, 3).map((c) => ({
    path: c.file_path,
    url: `${baseUrl}/${c.file_path}`
  }));

  return json({ answer, citations, confidence: context ? 'High' : 'Low' });
};
