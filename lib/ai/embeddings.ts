import { OPENROUTER_API_KEY } from '$env/static/private';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/embeddings';

export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: text.slice(0, 8000)
    })
  });

  if (!res.ok) throw new Error(`Embedding API failed: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await getEmbedding(text));
  }
  return results;
}
