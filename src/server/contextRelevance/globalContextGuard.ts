/**
 * Global context relevance gate — memory, outcomes, presets, project hints.
 * Default deny for project-specific context unless relevance is explicit or strong.
 */

export type ContextType = "memory" | "outcome" | "preset" | "project_hint";

export type ContextConfidence = "explicit" | "strong" | "weak" | "none";

export interface ShouldInjectContextInput {
  userPrompt: string;
  route?: string;
  workflowId?: string;
  contextType: ContextType;
  contextTitle?: string;
  contextBody?: string;
  projectName?: string;
  sourceTags?: string[];
  externalContextTitles?: string[];
  presetId?: string;
  explicitUserReferences?: string[];
  linkedRunId?: string;
  currentRunId?: string;
}

export interface ContextRelevanceResult {
  allow: boolean;
  confidence: ContextConfidence;
  reason: string;
  matchedTerms: string[];
  blockedTerms?: string[];
  genericTermsIgnored?: string[];
}

/** Terms that must not alone create relevance overlap. */
export const GENERIC_RELEVANCE_TERMS = new Set([
  "app",
  "business",
  "customer",
  "user",
  "product",
  "feature",
  "ai",
  "sales",
  "support",
  "traffic",
  "conversion",
  "test",
  "strategy",
  "workflow",
  "automation",
  "website",
  "page",
  "landing",
  "lead",
  "company",
  "service",
  "tool",
  "platform",
  "decision",
  "help",
  "build",
  "launch",
  "add",
  "find",
  "should",
  "what",
  "how",
  "when",
  "the",
  "and",
  "for",
  "with",
  "from",
  "your",
  "our",
  "this",
  "that",
]);

/** AI Front Desk domain — only inject when prompt/context explicitly references. */
export const AI_FRONT_DESK_DOMAIN_TERMS = [
  "ai front desk",
  "ai receptionist",
  "receptionist",
  "missed calls",
  "missed call",
  "missed-call recovery",
  "call recovery",
  "sms follow-up",
  "sms follow up",
  "delayed sms",
  "0 pilots",
  "pilot customers",
  "pilot customer",
  "plumbers",
  "hvac",
  "after-hours calls",
  "after hours calls",
] as const;

const EXPLICIT_OUTCOME_HISTORY =
  /\b(last time|prior outcome|past outcome|previous outcome|tracked outcome|what did i decide|decided last time|decision last time|outcome last time|based on (the )?outcome|from (the )?outcome)\b/i;

/** Strong signals the user is discussing the AI Front Desk project — not generic HVAC/missed-call copy. */
const STRONG_PROJECT_DOMAIN_REFERENCE =
  /\b(ai front desk|ai receptionist|delayed sms|0 pilots|sms follow-up|sms follow up)\b/i;

/** Sales/outreach writing that mentions operational terms but not the AFD project. */
const SALES_OUTREACH_WRITING_PROMPT =
  /\b(write a (cold )?email|write (a )?cold email|cold email to|draft (an )?email)\b/i;

const SUPPORT_OR_REWRITE_PROMPT =
  /\b(write a (calm )?support response|support response|refund (policy )?response|reply to a customer|customer support|billing issue|can't access (my )?account|charged me but)\b/i;

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenizeSignificant(text: string): string[] {
  const tokens = normalizeText(text)
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !GENERIC_RELEVANCE_TERMS.has(w));
  return [...new Set(tokens)];
}

function findBlockedDomainTerms(prompt: string, contextText: string): string[] {
  const promptNorm = normalizeText(prompt);
  const ctxNorm = normalizeText(contextText);
  const blocked: string[] = [];

  for (const term of AI_FRONT_DESK_DOMAIN_TERMS) {
    if (!ctxNorm.includes(term)) continue;
    if (promptNorm.includes(term)) continue;
    if (EXPLICIT_OUTCOME_HISTORY.test(prompt) && /\bsms\b/i.test(ctxNorm) && /\bsms\b/i.test(prompt)) {
      continue;
    }
    blocked.push(term);
  }
  return blocked;
}

export function promptExplicitlyReferencesDomain(prompt: string): boolean {
  const norm = normalizeText(prompt);
  if (STRONG_PROJECT_DOMAIN_REFERENCE.test(prompt)) return true;
  if (/\bai front desk\b/i.test(norm)) return true;
  if (EXPLICIT_OUTCOME_HISTORY.test(prompt) && /\b(sms|follow-up|follow up|ai front desk|delayed sms|0 pilots)\b/i.test(prompt)) {
    return true;
  }
  if (SALES_OUTREACH_WRITING_PROMPT.test(prompt) && !/\bai front desk\b/i.test(norm)) {
    return false;
  }
  return false;
}

function contextReferencesDomain(contextText: string, projectName?: string): boolean {
  const combined = normalizeText([projectName, contextText].filter(Boolean).join(" "));
  if (/\bai front desk\b/i.test(combined)) return true;
  return AI_FRONT_DESK_DOMAIN_TERMS.some((t) => combined.includes(t));
}

function significantTermOverlap(promptTerms: string[], contextTerms: string[]): string[] {
  const ctxSet = new Set(contextTerms);
  return promptTerms.filter((t) => ctxSet.has(t));
}

export function shouldInjectContext(input: ShouldInjectContextInput): ContextRelevanceResult {
  const prompt = input.userPrompt.trim();
  const promptNorm = normalizeText(prompt);
  const contextText = normalizeText(
    [input.contextTitle, input.contextBody, input.projectName, input.presetId]
      .filter(Boolean)
      .join(" "),
  );

  const genericIgnored = [
    ...new Set(
      normalizeText(prompt)
        .replace(/[^\w\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && GENERIC_RELEVANCE_TERMS.has(w)),
    ),
  ].slice(0, 12);

  if (!contextText && input.contextType !== "preset") {
    return {
      allow: false,
      confidence: "none",
      reason: "No context body to evaluate.",
      matchedTerms: [],
      genericTermsIgnored: genericIgnored,
    };
  }

  if (input.explicitUserReferences?.length) {
    const refs = input.explicitUserReferences.map(normalizeText);
    if (refs.some((r) => promptNorm.includes(r) || contextText.includes(r))) {
      return {
        allow: true,
        confidence: "explicit",
        reason: "Explicit user reference matched configured terms.",
        matchedTerms: refs.filter((r) => promptNorm.includes(r)),
        genericTermsIgnored: genericIgnored,
      };
    }
  }

  if (input.linkedRunId && input.currentRunId && input.linkedRunId === input.currentRunId) {
    return {
      allow: true,
      confidence: "explicit",
      reason: "Context linked to the current run.",
      matchedTerms: ["linked_run"],
      genericTermsIgnored: genericIgnored,
    };
  }

  if (EXPLICIT_OUTCOME_HISTORY.test(prompt)) {
    return {
      allow: true,
      confidence: "explicit",
      reason: "Prompt asks about prior decision, outcome, or history.",
      matchedTerms: ["outcome_history"],
      genericTermsIgnored: genericIgnored,
    };
  }

  if (promptExplicitlyReferencesDomain(prompt)) {
    return {
      allow: true,
      confidence: "explicit",
      reason: "Prompt explicitly references the project domain.",
      matchedTerms: AI_FRONT_DESK_DOMAIN_TERMS.filter((t) => promptNorm.includes(t)),
      genericTermsIgnored: genericIgnored,
    };
  }

  if (input.contextType === "preset") {
    const preset = input.presetId ?? "";
    if (preset === "none" || !preset) {
      return {
        allow: false,
        confidence: "none",
        reason: "Neutral preset — no project scenario injected.",
        matchedTerms: [],
        genericTermsIgnored: genericIgnored,
      };
    }
    if (preset === "ai-front-desk-sales-test") {
      return {
        allow: true,
        confidence: "explicit",
        reason: "User explicitly selected AI Front Desk Sales Test preset.",
        matchedTerms: ["ai-front-desk-sales-test"],
        genericTermsIgnored: genericIgnored,
      };
    }
    return {
      allow: false,
      confidence: "weak",
      reason: "Unknown preset requires explicit domain reference.",
      matchedTerms: [],
      genericTermsIgnored: genericIgnored,
    };
  }

  const blocked = findBlockedDomainTerms(prompt, contextText);
  if (blocked.length > 0 && contextReferencesDomain(contextText, input.projectName)) {
    if (SUPPORT_OR_REWRITE_PROMPT.test(prompt)) {
      return {
        allow: false,
        confidence: "none",
        reason: "Support or rewrite task — unrelated project outcome context blocked.",
        matchedTerms: [],
        blockedTerms: blocked,
        genericTermsIgnored: genericIgnored,
      };
    }
    return {
      allow: false,
      confidence: "none",
      reason: "AI Front Desk / SMS domain context blocked for unrelated prompt.",
      matchedTerms: [],
      blockedTerms: blocked,
      genericTermsIgnored: genericIgnored,
    };
  }

  const promptTerms = tokenizeSignificant(prompt);
  const contextTerms = tokenizeSignificant(contextText);
  const overlap = significantTermOverlap(promptTerms, contextTerms);

  if (overlap.length >= 2) {
    return {
      allow: true,
      confidence: "strong",
      reason: "Strong non-generic term overlap between prompt and context.",
      matchedTerms: overlap,
      genericTermsIgnored: genericIgnored,
    };
  }

  if (overlap.length === 1 && input.contextType === "outcome") {
    return {
      allow: false,
      confidence: "weak",
      reason: "Weak relevance — single generic-adjacent overlap insufficient for past outcome.",
      matchedTerms: overlap,
      genericTermsIgnored: genericIgnored,
    };
  }

  if (overlap.length === 1) {
    return {
      allow: false,
      confidence: "weak",
      reason: "Weak relevance — insufficient overlap for memory injection.",
      matchedTerms: overlap,
      genericTermsIgnored: genericIgnored,
    };
  }

  if (input.projectName?.trim() && promptNorm.includes(normalizeText(input.projectName))) {
    return {
      allow: true,
      confidence: "strong",
      reason: "Prompt names the project explicitly.",
      matchedTerms: [input.projectName],
      genericTermsIgnored: genericIgnored,
    };
  }

  const externalTitles = input.externalContextTitles ?? [];
  for (const title of externalTitles) {
    const titleNorm = normalizeText(title);
    if (titleNorm && promptNorm.includes(titleNorm.slice(0, 40))) {
      return {
        allow: true,
        confidence: "strong",
        reason: "Attached external context title referenced in prompt.",
        matchedTerms: [title],
        genericTermsIgnored: genericIgnored,
      };
    }
  }

  return {
    allow: false,
    confidence: "none",
    reason:
      input.contextType === "outcome"
        ? "Past outcome excluded: not relevant to current prompt."
        : input.contextType === "memory"
          ? "Memory excluded: weak relevance."
          : "Project context excluded: not relevant to current prompt.",
    matchedTerms: overlap,
    genericTermsIgnored: genericIgnored,
  };
}

export function traceExclusionMessage(
  contextType: ContextType,
  result: ContextRelevanceResult,
  label?: string,
): string {
  const prefix = label ? `${label}: ` : `${contextType}: `;
  if (result.allow) {
    return `${prefix}included (${result.confidence}) — ${result.reason}`;
  }
  return `${prefix}excluded (${result.confidence}) — ${result.reason}`;
}
