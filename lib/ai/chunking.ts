const CHUNK_SIZE = 1200;
const OVERLAP = 150;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string): { chunk: string; startOffset: number }[] {
  const chunks: { chunk: string; startOffset: number }[] = [];
  const lines = text.split('\n');
  let currentChunk = '';
  let currentTokens = 0;
  let startOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line + '\n');

    if (currentTokens + lineTokens > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({ chunk: currentChunk.trim(), startOffset });
      const overlapLines = currentChunk.split('\n').slice(-Math.ceil(OVERLAP / 4));
      currentChunk = overlapLines.join('\n') + '\n';
      currentTokens = estimateTokens(currentChunk);
      startOffset = i - overlapLines.length;
    }

    currentChunk += line + '\n';
    currentTokens += lineTokens;
  }

  if (currentChunk.trim()) {
    chunks.push({ chunk: currentChunk.trim(), startOffset });
  }

  return chunks;
}
