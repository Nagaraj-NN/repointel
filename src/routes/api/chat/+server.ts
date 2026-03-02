import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db/client';
import { getEmbedding } from '$lib/ai/embeddings';
import { chat, RAG_SYSTEM_PROMPT } from '$lib/ai/llm';
import { isReadApiAuthorized } from '$lib/auth';

export const POST: RequestHandler = async ({ request, url }) => {
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
  const queryEmbedding = await getEmbedding(message);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const chunks = await db`
    SELECT re.content_chunk, re.file_path, r.full_name, r.default_branch
    FROM repo_embeddings re
    JOIN repositories r ON r.id = re.repo_id
    ORDER BY re.embedding <=> ${embeddingStr}::vector
    LIMIT 15
  `;

  const context = chunks
    .map(
      (c) =>
        `[${c.full_name}/${c.file_path}](https://github.com/${c.full_name}/blob/${c.default_branch}/${c.file_path})\n${c.content_chunk}`
    )
    .join('\n\n---\n\n');

  const systemPrompt = `${RAG_SYSTEM_PROMPT}\n\nContext from organization repositories:\n\n${context || 'No relevant context found.'}`;

  const answer = await chat([{ role: 'user', content: message }], systemPrompt);

  const citations = [...new Set(chunks.slice(0, 5).map((c) => c.full_name))].map((fullName) => {
    const c = chunks.find((x) => x.full_name === fullName);
    return {
      repo: fullName,
      url: `https://github.com/${fullName}`
    };
  });

  return json({ answer, citations, confidence: context ? 'High' : 'Low' });
};
