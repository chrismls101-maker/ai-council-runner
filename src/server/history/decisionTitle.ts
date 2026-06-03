const PRESET_SHORT: Record<string, string> = {
  "ai-front-desk-sales-test": "AI Front Desk",
};

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "for",
  "and",
  "or",
  "to",
  "in",
  "on",
  "at",
  "with",
  "my",
  "our",
  "i",
  "we",
  "need",
  "want",
  "help",
  "please",
  "can",
  "you",
  "me",
  "is",
  "are",
  "was",
  "be",
  "this",
  "that",
  "it",
  "of",
  "from",
  "as",
  "by",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "run",
  "using",
  "use",
]);

function titleCase(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function extractMeaningfulWords(prompt: string, maxWords = 8): string {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w]+|[^\w]+$/g, ""))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));

  return words.slice(0, maxWords).map(titleCase).join(" ");
}

export function generateDecisionTitle(
  preset: string,
  workflowId: string,
  workflowName: string,
  prompt: string,
): string {
  const excerpt = extractMeaningfulWords(prompt, 6);
  const presetShort = PRESET_SHORT[preset];

  if (presetShort && preset !== "none" && excerpt) {
    return `${presetShort} — ${excerpt}`;
  }

  if (workflowId === "competitive-intelligence" && excerpt) {
    return `Competitor Review — ${excerpt}`;
  }

  if (workflowId === "technical-audit" && excerpt) {
    return `Technical Audit — ${excerpt}`;
  }

  if (workflowId === "market-research" && excerpt) {
    const lower = excerpt.toLowerCase();
    if (lower.includes("research") || lower.includes("market")) {
      return excerpt;
    }
    return `${excerpt} Market Research`;
  }

  if (workflowId === "product-decision" && excerpt) {
    const lower = excerpt.toLowerCase();
    if (lower.includes("decision")) {
      return excerpt;
    }
    return `${excerpt} Decision`;
  }

  if (excerpt) {
    return excerpt;
  }

  return workflowName || "Decision Record";
}
