export type ContextRelevanceLabel = "relevant" | "possibly_relevant" | "not_relevant";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "is",
  "it",
  "this",
  "that",
  "with",
  "as",
  "by",
  "from",
  "be",
  "are",
  "was",
  "were",
  "what",
  "how",
  "why",
  "when",
  "where",
  "who",
  "which",
  "do",
  "does",
  "did",
  "can",
  "could",
  "should",
  "would",
  "will",
  "my",
  "me",
  "i",
  "you",
  "your",
  "we",
  "our",
  "they",
  "their",
  "about",
  "into",
  "than",
  "then",
  "so",
  "if",
  "not",
  "no",
  "yes",
  "all",
  "any",
  "some",
  "more",
  "most",
  "other",
  "such",
  "only",
  "also",
  "just",
  "very",
  "too",
  "tell",
  "explain",
  "describe",
  "help",
  "please",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function uniqueTokens(texts: string[]): Set<string> {
  const out = new Set<string>();
  for (const text of texts) {
    for (const token of tokenize(text)) out.add(token);
  }
  return out;
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.min(a.size, b.size);
}

function titleMatchScore(promptTokens: Set<string>, title: string): number {
  const titleTokens = tokenize(title);
  if (titleTokens.length === 0) return 0;
  let hits = 0;
  for (const token of titleTokens) {
    if (promptTokens.has(token)) hits += 1;
  }
  return hits / titleTokens.length;
}

export function scoreContextRelevance(
  userPrompt: string,
  context: {
    title: string;
    contentText: string;
    contentSummary?: string;
    tags?: string[];
  },
): { label: ContextRelevanceLabel; score: number } {
  const promptTokens = uniqueTokens([userPrompt]);
  if (promptTokens.size === 0) {
    return { label: "possibly_relevant", score: 0 };
  }

  const contextTokens = uniqueTokens([
    context.title,
    context.contentSummary ?? "",
    context.contentText.slice(0, 2000),
    ...(context.tags ?? []),
  ]);

  const keywordScore = overlapRatio(promptTokens, contextTokens);
  const titleScore = titleMatchScore(promptTokens, context.title);
  const score = Math.max(keywordScore, titleScore * 0.85);

  if (score >= 0.2 || titleScore >= 0.5) {
    return { label: "relevant", score };
  }
  if (score >= 0.06) {
    return { label: "possibly_relevant", score };
  }
  return { label: "not_relevant", score };
}

export function formatRelevanceLabel(label: ContextRelevanceLabel): string {
  switch (label) {
    case "relevant":
      return "relevant";
    case "possibly_relevant":
      return "possibly relevant";
    case "not_relevant":
      return "not relevant";
  }
}
