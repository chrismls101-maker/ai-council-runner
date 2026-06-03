/** Base delay between chunks (ms) — tune pacing here. */
export const SHORT_CHAR_DELAY_MS = 58;
export const MEDIUM_DELAY_MS = 118;
export const LONG_DELAY_MS = 78;

/** Extra pause after punctuation (ms). */
export const PUNCTUATION_PAUSE_COMMA_MS = 145;
export const PUNCTUATION_PAUSE_SENTENCE_MS = 340;
export const PUNCTUATION_PAUSE_PARAGRAPH_MS = 520;

export const PUNCTUATION_PAUSE_MS = {
  comma: PUNCTUATION_PAUSE_COMMA_MS,
  sentence: PUNCTUATION_PAUSE_SENTENCE_MS,
  paragraph: PUNCTUATION_PAUSE_PARAGRAPH_MS,
} as const;

/** @deprecated Use SHORT_CHAR_DELAY_MS — kept for hook fallback. */
export const SHORT_DELAY_MS = SHORT_CHAR_DELAY_MS;

export interface TypewriterRevealPlan {
  chunks: string[];
  /** Delay before revealing chunk at the same index. */
  delaysMs: number[];
}

type PacingTier = "short" | "medium" | "long";

function getPacingTier(wordCount: number): PacingTier {
  if (wordCount < 150) return "short";
  if (wordCount < 500) return "medium";
  return "long";
}

function getBaseDelayMs(tier: PacingTier, chunkIndex: number): number {
  if (tier === "short") {
    const offsets = [0, 6, -4, 8, -2, 10];
    return SHORT_CHAR_DELAY_MS + offsets[chunkIndex % offsets.length];
  }
  if (tier === "medium") {
    const offsets = [0, 8, -5, 12];
    return MEDIUM_DELAY_MS + offsets[chunkIndex % offsets.length];
  }
  const offsets = [0, 6, -4, 9];
  return LONG_DELAY_MS + offsets[chunkIndex % offsets.length];
}

function buildChunksForTier(content: string, tier: PacingTier): string[] {
  if (tier === "short") {
    // Character-by-character for direct answers — reads like ChatGPT streaming
    return Array.from(content);
  }

  const words = content.match(/\S+\s*/g) ?? [content];
  const chunks: string[] = [];
  let chunkIndex = 0;

  for (let i = 0; i < words.length; ) {
    const wordsPerChunk =
      tier === "medium" ? 1 : [2, 2, 3, 3][chunkIndex % 4];
    const take = Math.min(wordsPerChunk, words.length - i);
    chunks.push(words.slice(i, i + take).join(""));
    i += take;
    chunkIndex += 1;
  }

  return chunks;
}

export function getPunctuationPauseMs(chunk: string): number {
  const trimmed = chunk.trimEnd();
  if (!trimmed) return 0;

  if (/\n\s*\n\s*$/.test(chunk)) {
    return PUNCTUATION_PAUSE_MS.paragraph;
  }

  const lastChar = trimmed.slice(-1);
  if (lastChar === "." || lastChar === "?" || lastChar === "!") {
    return PUNCTUATION_PAUSE_MS.sentence;
  }
  if (lastChar === "," || lastChar === ";" || lastChar === ":") {
    return PUNCTUATION_PAUSE_MS.comma;
  }

  return 0;
}

/** Split answer text into chunks with adaptive speed for long answers. */
export function buildTypewriterRevealPlan(content: string): TypewriterRevealPlan {
  const trimmed = content.trim();
  if (!trimmed) {
    return { chunks: [], delaysMs: [] };
  }

  const wordCount = (trimmed.match(/\S+/g) ?? []).length;
  const tier = getPacingTier(wordCount);
  const chunks = buildChunksForTier(trimmed, tier);

  const delaysMs = chunks.map((_chunk, index) => {
    const baseDelay = getBaseDelayMs(tier, index);
    const punctuationPause =
      index === 0 ? 0 : getPunctuationPauseMs(chunks[index - 1] ?? "");
    return baseDelay + punctuationPause;
  });

  return { chunks, delaysMs };
}
