/**
 * Passive context engine for IIVO Glass.
 *
 * Watches ask/response interactions locally and derives a rolling userContext
 * summary — no forms after onboarding, no server storage.
 *
 * Persistence: Electron main writes `userData/glass-context.json` via
 * glassContextStore (wired separately). This module is pure logic + JSON helpers.
 */

import type { GlassUserProfile } from "./glassUserProfile.ts";
import { hasGlassUserProfile } from "./glassUserProfile.ts";

export const GLASS_CONTEXT_FILE = "glass-context.json";
export const GLASS_CONTEXT_MAX_INTERACTIONS = 50;
export const GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL = 5;
export const GLASS_CONTEXT_SEED_INTERACTIONS = 10;

export type GlassContextTopicCategory =
  | "decision"
  | "meeting"
  | "writing"
  | "research"
  | "translation"
  | "coding"
  | "general";

export interface GlassContextInteraction {
  id: string;
  at: string;
  question: string;
  category: GlassContextTopicCategory;
  keywords: string[];
}

export interface GlassContextTopicCount {
  category: GlassContextTopicCategory;
  count: number;
}

export interface GlassContextSummary {
  inferredRole: string;
  frequentTopics: GlassContextTopicCount[];
  recentFocusAreas: string[];
  rebuiltAt: string;
  interactionCountAtRebuild: number;
}

export interface GlassContextProfile {
  version: 1;
  interactions: GlassContextInteraction[];
  summary: GlassContextSummary | null;
  totalInteractionsRecorded: number;
  updatedAt: string;
}

export interface GlassContextInteractionInput {
  question: string;
  /** ISO timestamp; defaults to now when recording. */
  at?: string;
  id?: string;
}

const STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "any",
  "are",
  "ask",
  "can",
  "could",
  "does",
  "for",
  "from",
  "glass",
  "have",
  "help",
  "here",
  "how",
  "iivo",
  "into",
  "just",
  "like",
  "make",
  "more",
  "need",
  "please",
  "should",
  "some",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "while",
  "will",
  "with",
  "would",
  "your",
]);

const CATEGORY_ORDER: GlassContextTopicCategory[] = [
  "decision",
  "meeting",
  "writing",
  "research",
  "translation",
  "coding",
  "general",
];

const CATEGORY_PATTERNS: Record<Exclude<GlassContextTopicCategory, "general">, RegExp[]> = {
  decision: [
    /\bdecide\b/i,
    /\bdecision\b/i,
    /\bshould i\b/i,
    /\bwhich (?:one|option|path)\b/i,
    /\btrade[- ]?off/i,
    /\bpros and cons\b/i,
    /\bvs\.?\b/i,
    /\bversus\b/i,
    /\bprioriti(?:y|ze)\b/i,
  ],
  meeting: [
    /\bmeeting\b/i,
    /\bcall\b/i,
    /\bagenda\b/i,
    /\bstandup\b/i,
    /\b1:1\b/i,
    /\bone on one\b/i,
    /\bsync\b/i,
    /\bdiscussion\b/i,
    /\bworkshop\b/i,
  ],
  writing: [
    /\bwrite\b/i,
    /\bwriting\b/i,
    /\bdraft\b/i,
    /\bemail\b/i,
    /\btone\b/i,
    /\brewrite\b/i,
    /\bedit\b/i,
    /\bproofread\b/i,
    /\bcopy\b/i,
    /\bmessage\b/i,
  ],
  research: [
    /\bresearch\b/i,
    /\bexplain\b/i,
    /\bwhat is\b/i,
    /\bwhat are\b/i,
    /\bhow does\b/i,
    /\bhow do\b/i,
    /\blearn about\b/i,
    /\bsummari(?:z|s)e\b/i,
    /\boverview\b/i,
    /\bcompare\b/i,
  ],
  translation: [
    /\btranslate\b/i,
    /\btranslation\b/i,
    /\blanguage\b/i,
    /\bspanish\b/i,
    /\bfrench\b/i,
    /\bgerman\b/i,
    /\bjapanese\b/i,
    /\bchinese\b/i,
    /\bportuguese\b/i,
    /\benglish\b/i,
  ],
  coding: [
    /\bcode\b/i,
    /\bcoding\b/i,
    /\bbug\b/i,
    /\bdebug\b/i,
    /\berror\b/i,
    /\bfunction\b/i,
    /\btypescript\b/i,
    /\bjavascript\b/i,
    /\bpython\b/i,
    /\bapi\b/i,
    /\brefactor\b/i,
    /\bimplement\b/i,
    /\bcommit\b/i,
    /\bpull request\b/i,
    /\bregex\b/i,
  ],
};

const ROLE_BY_DOMINANT_CATEGORY: Partial<Record<GlassContextTopicCategory, string>> = {
  coding: "technical builder (code-heavy questions)",
  meeting: "meeting-driven collaborator",
  writing: "communicator (writing and messaging)",
  research: "research-oriented learner",
  decision: "decision-maker weighing options",
  translation: "multilingual operator",
};

export function defaultGlassContextProfile(now = new Date()): GlassContextProfile {
  const at = now.toISOString();
  return {
    version: 1,
    interactions: [],
    summary: null,
    totalInteractionsRecorded: 0,
    updatedAt: at,
  };
}

export function parseGlassContextProfile(raw: unknown): GlassContextProfile {
  if (!raw || typeof raw !== "object") return defaultGlassContextProfile();
  const parsed = raw as Partial<GlassContextProfile>;
  const interactions = Array.isArray(parsed.interactions)
    ? parsed.interactions
        .map(normalizeInteraction)
        .filter((item): item is GlassContextInteraction => item != null)
        .slice(-GLASS_CONTEXT_MAX_INTERACTIONS)
    : [];

  return {
    version: 1,
    interactions,
    summary: normalizeSummary(parsed.summary),
    totalInteractionsRecorded: Math.max(
      0,
      Math.floor(Number(parsed.totalInteractionsRecorded) || interactions.length),
    ),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
  };
}

export function categorizeGlassContextTopic(question: string): GlassContextTopicCategory {
  const text = question.trim();
  if (!text) return "general";

  for (const category of CATEGORY_ORDER) {
    if (category === "general") continue;
    const patterns = CATEGORY_PATTERNS[category];
    if (patterns.some((pattern) => pattern.test(text))) {
      return category;
    }
  }
  return "general";
}

export function extractGlassContextKeywords(question: string, limit = 8): string[] {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 3 && !STOPWORDS.has(token));

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    keywords.push(token);
    if (keywords.length >= limit) break;
  }
  return keywords;
}

export function buildGlassContextInteraction(
  input: GlassContextInteractionInput,
  now = new Date(),
): GlassContextInteraction {
  const question = input.question.trim();
  return {
    id: input.id ?? `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    at: input.at ?? now.toISOString(),
    question,
    category: categorizeGlassContextTopic(question),
    keywords: extractGlassContextKeywords(question),
  };
}

/** Append one interaction after a Glass response; rebuild summary every N interactions. */
export function recordGlassContextInteraction(
  profile: GlassContextProfile,
  input: GlassContextInteractionInput,
  onboardingSeed?: GlassUserProfile | null,
  now = new Date(),
): GlassContextProfile {
  const interaction = buildGlassContextInteraction(input, now);
  const interactions = [...profile.interactions, interaction].slice(-GLASS_CONTEXT_MAX_INTERACTIONS);
  const totalInteractionsRecorded = profile.totalInteractionsRecorded + 1;

  const shouldRebuild =
    totalInteractionsRecorded % GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL === 0 ||
    profile.summary == null;

  return {
    version: 1,
    interactions,
    summary: shouldRebuild
      ? buildGlassContextSummary(interactions, onboardingSeed, totalInteractionsRecorded, now)
      : profile.summary,
    totalInteractionsRecorded,
    updatedAt: now.toISOString(),
  };
}

export function buildGlassContextSummary(
  interactions: GlassContextInteraction[],
  onboardingSeed?: GlassUserProfile | null,
  interactionCount = interactions.length,
  now = new Date(),
): GlassContextSummary | null {
  if (interactions.length === 0) return null;

  const counts = new Map<GlassContextTopicCategory, number>();
  for (const item of interactions) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  const frequentTopics = CATEGORY_ORDER.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  const recentFocusAreas = collectRecentFocusAreas(interactions);
  const inferredRole = inferGlassContextRole(frequentTopics, onboardingSeed, interactionCount);

  return {
    inferredRole,
    frequentTopics,
    recentFocusAreas,
    rebuiltAt: now.toISOString(),
    interactionCountAtRebuild: interactionCount,
  };
}

/**
 * Resolve `userContext` for POST /api/glass/ask.
 * Returns undefined when there is nothing useful to send (new user).
 */
export function resolveGlassUserContext(
  profile: GlassContextProfile | null | undefined,
  onboardingSeed?: GlassUserProfile | null,
): string | undefined {
  const normalizedProfile = profile ?? defaultGlassContextProfile();
  const seedProfile = hasGlassUserProfile(onboardingSeed) ? onboardingSeed! : null;

  if (normalizedProfile.totalInteractionsRecorded < GLASS_CONTEXT_SEED_INTERACTIONS && seedProfile) {
    const seed = formatOnboardingSeedContext(seedProfile);
    return seed.trim() || undefined;
  }

  if (!normalizedProfile.summary) return undefined;
  const derived = formatDerivedContextSummary(normalizedProfile.summary);
  return derived.trim() || undefined;
}

export function formatOnboardingSeedContext(profile: GlassUserProfile): string {
  const lines = ["User context (Glass calibration — seed, local only):"];
  if (profile.name.trim()) lines.push(`Name: ${profile.name.trim()}`);
  if (profile.usualWork.trim()) lines.push(`Kind of work: ${profile.usualWork.trim()}`);
  if (profile.currentFocus.trim()) lines.push(`Current focus: ${profile.currentFocus.trim()}`);
  lines.push(
    "Use this to personalize tone and examples. Do not invent details beyond what is written.",
  );
  return lines.join("\n");
}

export function formatDerivedContextSummary(summary: GlassContextSummary): string {
  const topTopics = summary.frequentTopics
    .filter((entry) => entry.category !== "general")
    .slice(0, 4)
    .map((entry) => `${entry.category} (${entry.count})`)
    .join(", ");

  const lines = [
    "User context (inferred from recent Glass interactions — local only):",
    `Role tendency: ${summary.inferredRole}`,
  ];

  if (topTopics) {
    lines.push(`Often asks about: ${topTopics}`);
  }

  if (summary.recentFocusAreas.length > 0) {
    lines.push(`Recent focus areas: ${summary.recentFocusAreas.join(", ")}`);
  }

  lines.push(
    "Personalize answers to these patterns. Do not claim certainty about job title or identity beyond these signals.",
  );
  return lines.join("\n");
}

function collectRecentFocusAreas(interactions: GlassContextInteraction[]): string[] {
  const recent = interactions.slice(-12);
  const scores = new Map<string, number>();

  for (const item of recent) {
    for (const keyword of item.keywords) {
      scores.set(keyword, (scores.get(keyword) ?? 0) + 1);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([keyword]) => keyword);
}

function inferGlassContextRole(
  frequentTopics: GlassContextTopicCount[],
  onboardingSeed: GlassUserProfile | null | undefined,
  interactionCount: number,
): string {
  const dominant = frequentTopics.find((entry) => entry.category !== "general");
  const fromPatterns = dominant ? ROLE_BY_DOMINANT_CATEGORY[dominant.category] : undefined;

  if (interactionCount < GLASS_CONTEXT_SEED_INTERACTIONS && onboardingSeed?.usualWork.trim()) {
    const work = onboardingSeed.usualWork.trim();
    if (fromPatterns) {
      return `${work}; leaning toward ${fromPatterns}`;
    }
    return work;
  }

  if (fromPatterns) return fromPatterns;

  if (onboardingSeed?.usualWork.trim()) {
    return onboardingSeed.usualWork.trim();
  }

  return "general knowledge worker";
}

function normalizeInteraction(raw: unknown): GlassContextInteraction | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<GlassContextInteraction>;
  const question = typeof item.question === "string" ? item.question.trim() : "";
  if (!question) return null;

  const category = isGlassContextTopicCategory(item.category)
    ? item.category
    : categorizeGlassContextTopic(question);

  const keywords = Array.isArray(item.keywords)
    ? item.keywords.filter((value): value is string => typeof value === "string").slice(0, 12)
    : extractGlassContextKeywords(question);

  return {
    id: typeof item.id === "string" ? item.id : `${Date.now()}`,
    at: typeof item.at === "string" ? item.at : new Date().toISOString(),
    question,
    category,
    keywords,
  };
}

function normalizeSummary(raw: unknown): GlassContextSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const summary = raw as Partial<GlassContextSummary>;
  if (typeof summary.inferredRole !== "string" || !summary.inferredRole.trim()) return null;

  const frequentTopics = Array.isArray(summary.frequentTopics)
    ? summary.frequentTopics
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const row = entry as Partial<GlassContextTopicCount>;
          if (!isGlassContextTopicCategory(row.category)) return null;
          return {
            category: row.category,
            count: Math.max(0, Math.floor(Number(row.count) || 0)),
          };
        })
        .filter((entry): entry is GlassContextTopicCount => entry != null && entry.count > 0)
    : [];

  const recentFocusAreas = Array.isArray(summary.recentFocusAreas)
    ? summary.recentFocusAreas.filter((value): value is string => typeof value === "string")
    : [];

  return {
    inferredRole: summary.inferredRole.trim(),
    frequentTopics,
    recentFocusAreas,
    rebuiltAt: typeof summary.rebuiltAt === "string" ? summary.rebuiltAt : new Date().toISOString(),
    interactionCountAtRebuild: Math.max(
      0,
      Math.floor(Number(summary.interactionCountAtRebuild) || 0),
    ),
  };
}

function isGlassContextTopicCategory(value: unknown): value is GlassContextTopicCategory {
  return (
    value === "decision" ||
    value === "meeting" ||
    value === "writing" ||
    value === "research" ||
    value === "translation" ||
    value === "coding" ||
    value === "general"
  );
}
