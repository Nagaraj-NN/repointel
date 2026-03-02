import { OPENROUTER_API_KEY } from '$env/static/private';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function chat(
  messages: { role: string; content: string }[],
  systemPrompt?: string
): Promise<string> {
  const apiKey = OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'minimax/minimax-m2.5',
      messages: allMessages,
      max_tokens: 1024
    })
  });

  if (!res.ok) throw new Error(`LLM API failed: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0]?.message?.content ?? '';
}

export const RAG_SYSTEM_PROMPT = `You are RepoIntel, an AI assistant that answers questions about code repositories.
Rules:
- Always cite sources with file paths and GitHub URLs when possible.
- Include confidence level: High, Medium, or Low.
- Only use information from the provided context. If the context doesn't contain the answer, say so.
- Format: Provide a direct answer, then list sources with file paths and line references.`;
