/**
 * Aletheia research conversation (B3.4).
 *
 * Web lookup routed through Aletheia's companion surface — citations inline,
 * thread context for follow-ups, no agent/provider names exposed.
 */

import { randomUUID } from "node:crypto";

export type ResearchConversationPhase = "idle" | "researching" | "complete" | "failed";

export type ResearchQueryCategory =
  | "general_lookup"
  | "company_research"
  | "latest_news"
  | "compare_options"
  | "verify_claim"
  | "follow_up";

export type ResearchFollowUpAction =
  | "summarize"
  | "compare_deeper"
  | "save_to_notes"
  | "draft_from_findings"
  | "hand_to_writing";

export interface ResearchCitation {
  index: number;
  url: string;
}

export interface AletheiaResearchConversationSnapshot {
  threadId: string;
  phase: ResearchConversationPhase;
  query: string;
  queryCategory: ResearchQueryCategory;
  synthesis?: string;
  citations: ResearchCitation[];
  /** Prior queries in this thread — for follow-up context. */
  priorQueries: string[];
  statusMessage?: string;
  errorMessage?: string;
  startedAt: number;
  updatedAt: number;
}

export interface ResearchConversationIntent {
  query: string;
  category: ResearchQueryCategory;
  matched: string;
  isFollowUp?: boolean;
  /** Set when the user asked for a structured follow-up action (summarize, compare, etc.). */
  followUpAction?: ResearchFollowUpAction;
}

const LOOKUP_PATTERNS: Array<{ pattern: RegExp; category: ResearchQueryCategory }> = [
  { pattern: /\blook (this|that|it) up\b/i, category: "general_lookup" },
  { pattern: /\bresearch (this|that|the|a|an) .{4,100}/i, category: "company_research" },
  { pattern: /\bfind the latest on .{4,100}/i, category: "latest_news" },
  { pattern: /\bcompare (these|the|those) options\b/i, category: "compare_options" },
  { pattern: /\bgo verify (that|this|whether) .{4,100}/i, category: "verify_claim" },
  { pattern: /\bcheck the web (for|about|on)? .{0,80}/i, category: "general_lookup" },
  { pattern: /\bwhat(?:'s| is) the latest on .{4,100}/i, category: "latest_news" },
  { pattern: /\bfind out (about|more about) .{4,100}/i, category: "general_lookup" },
];

const FOLLOW_UP_PATTERNS: Array<{ pattern: RegExp; action: ResearchFollowUpAction }> = [
  { pattern: /\b(summarize|sum up|short version)\b/i, action: "summarize" },
  { pattern: /\b(compare (deeper|more|in detail)|dig deeper)\b/i, action: "compare_deeper" },
  { pattern: /\b(save (this|that|it|to notes)|remember (this|that))\b/i, action: "save_to_notes" },
  { pattern: /\b(draft (from|based on)|write (this|that) up)\b/i, action: "draft_from_findings" },
  { pattern: /\b(hand (this|that) to writing|turn (this|that) into a doc)\b/i, action: "hand_to_writing" },
];

/** Narrow follow-ups on an existing research thread — avoids hijacking normal companion chat. */
const THREAD_CONTINUATION_PATTERNS: RegExp[] = [
  /\b(what about|how about|tell me more|more on|more about|specifically|drill down|follow up|expand on|also check)\b/i,
  /\b(what if|how does that|does that apply|in (europe|asia|the us|canada|uk))\b/i,
];

function firstPatternMatch(text: string): { matched: string; category: ResearchQueryCategory } | null {
  for (const entry of LOOKUP_PATTERNS) {
    const match = text.match(entry.pattern);
    if (match?.[0]) return { matched: match[0], category: entry.category };
  }
  return null;
}

export function classifyResearchConversationIntent(
  text: string,
  existingThread?: AletheiaResearchConversationSnapshot,
): ResearchConversationIntent | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 8) return null;

  const lookup = firstPatternMatch(trimmed);
  if (lookup) {
    return {
      query: trimmed,
      category: lookup.category,
      matched: lookup.matched,
    };
  }

  if (existingThread?.phase === "complete" && existingThread.synthesis) {
    const followUpAction = classifyResearchFollowUp(trimmed);
    if (followUpAction) {
      return {
        query: trimmed,
        category: "follow_up",
        matched: trimmed,
        isFollowUp: true,
        followUpAction,
      };
    }
    for (const pattern of THREAD_CONTINUATION_PATTERNS) {
      if (!pattern.test(trimmed)) continue;
      return {
        query: trimmed,
        category: "follow_up",
        matched: trimmed,
        isFollowUp: true,
      };
    }
  }

  return null;
}

export function classifyResearchFollowUp(text: string): ResearchFollowUpAction | null {
  const trimmed = text.trim();
  for (const entry of FOLLOW_UP_PATTERNS) {
    if (entry.pattern.test(trimmed)) return entry.action;
  }
  return null;
}

export function isResearchConversationActive(
  snapshot: AletheiaResearchConversationSnapshot | undefined,
): boolean {
  return snapshot?.phase === "researching";
}

export function researchIntroSpeech(): string {
  return "I'm checking the web for that now.";
}

export function researchCompleteSpeech(citationCount: number): string {
  if (citationCount > 0) {
    return `I found ${citationCount} strong source${citationCount === 1 ? "" : "s"}. Here's the picture.`;
  }
  return "Here's what I found.";
}

export function initialResearchConversationSnapshot(
  intent: ResearchConversationIntent,
  priorQueries: string[] = [],
  options?: { threadId?: string; now?: number },
): AletheiaResearchConversationSnapshot {
  const now = options?.now ?? Date.now();
  return {
    threadId: options?.threadId ?? randomUUID(),
    phase: "researching",
    query: intent.query,
    queryCategory: intent.category,
    citations: [],
    priorQueries,
    statusMessage: "Researching…",
    startedAt: now,
    updatedAt: now,
  };
}

export function finalizeResearchConversation(
  snapshot: AletheiaResearchConversationSnapshot,
  input: {
    synthesis: string;
    citations: ResearchCitation[];
    ok: boolean;
    errorMessage?: string;
  },
  now = Date.now(),
): AletheiaResearchConversationSnapshot {
  return {
    ...snapshot,
    phase: input.ok ? "complete" : "failed",
    synthesis: input.synthesis,
    citations: input.citations,
    statusMessage: input.ok ? undefined : input.errorMessage,
    errorMessage: input.errorMessage,
    priorQueries: [...snapshot.priorQueries, snapshot.query],
    updatedAt: now,
  };
}

export function parseCitationsFromToolResult(text: string): ResearchCitation[] {
  const citations: ResearchCitation[] = [];
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^\[(\d+)\]\s+(https?:\/\/\S+)/);
    if (!match) continue;
    citations.push({ index: Number(match[1]), url: match[2] });
  }
  return citations;
}

export function formatResearchSynthesisWithCitations(
  synthesis: string,
  citations: ResearchCitation[],
): string {
  const body = synthesis.trim();
  if (citations.length === 0) return body;
  const sources = citations.map((c) => `[${c.index}] ${c.url}`).join("\n");
  return `${body}\n\nSources:\n${sources}`;
}

export function buildResearchPrompt(input: {
  query: string;
  priorQueries: string[];
  followUpAction?: ResearchFollowUpAction;
  priorSynthesis?: string;
}): string {
  const parts: string[] = [input.query];
  if (input.priorQueries.length > 0) {
    parts.push(
      `\nPrior questions in this thread:\n${input.priorQueries.map((q) => `- ${q}`).join("\n")}`,
    );
  }
  if (input.priorSynthesis?.trim()) {
    parts.push(`\nPrior findings:\n${input.priorSynthesis.trim().slice(0, 3000)}`);
  }
  if (input.followUpAction === "summarize") {
    parts.push("\nProvide a concise summary of the prior findings.");
  } else if (input.followUpAction === "compare_deeper") {
    parts.push("\nCompare the options in more depth with evidence from the web.");
  } else if (input.followUpAction === "draft_from_findings") {
    parts.push("\nDraft a clear document from these findings.");
  }
  parts.push(
    "\nRespond as Aletheia speaking to the user. Do not mention agents, tools, or providers.",
  );
  return parts.join("");
}

export function followUpActionLabel(action: ResearchFollowUpAction): string {
  switch (action) {
    case "summarize":
      return "Summarize";
    case "compare_deeper":
      return "Compare deeper";
    case "save_to_notes":
      return "Save to notes";
    case "draft_from_findings":
      return "Draft from findings";
    case "hand_to_writing":
      return "Hand to writing";
    default:
      return action;
  }
}

export function categorizeQueryForLog(category: ResearchQueryCategory): string {
  return category.replace(/_/g, "-");
}
