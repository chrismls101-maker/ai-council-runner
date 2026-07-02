/**
 * Glass Guide — pre-session goal extraction from context + scrollback.
 */

import type { GlassContextProfile } from "../shared/glassContextEngine.ts";

const GOAL_LOOKBACK_MS = 5 * 60 * 1000;

export function extractUserGoalFromContext(input: {
  contextProfile: GlassContextProfile | null;
  scrollbackSummary: string | null;
  now?: number;
}): string | null {
  const now = input.now ?? Date.now();
  const snippets: string[] = [];

  if (input.contextProfile?.interactions?.length) {
    const recent = input.contextProfile.interactions.filter((i) => {
      const atMs = Date.parse(i.at);
      return Number.isFinite(atMs) && now - atMs <= GOAL_LOOKBACK_MS;
    });
    for (const interaction of recent.slice(-5)) {
      if (interaction.question?.trim()) snippets.push(interaction.question.trim());
    }
  }

  const scrollback =
    typeof input.scrollbackSummary === "string" ? input.scrollbackSummary : null;
  if (scrollback?.trim()) {
    snippets.push(scrollback.trim().slice(0, 400));
  }

  if (snippets.length === 0) return null;

  const combined = snippets.join(" · ");
  const goalPatterns = [
    /finish (?:the )?(.{10,80})/i,
    /work on (.{10,80})/i,
    /(?:need to|going to|want to) (.{10,80})/i,
    /(?:report|deck|mockup|doc|document|spreadsheet) (?:in|for|about) (.{5,60})/i,
  ];

  for (const pattern of goalPatterns) {
    const match = pattern.exec(combined);
    if (match?.[1]) return match[1].trim().replace(/\.$/, "");
  }

  const first = snippets[0];
  if (first && first.length > 12) {
    return first.slice(0, 120).replace(/\.$/, "");
  }
  return null;
}

export function inferUserRoleFromContext(
  contextProfile: GlassContextProfile | null,
  persona?: string | null,
): string | null {
  if (persona && persona !== "general") {
    const map: Record<string, string> = {
      developer: "developer",
      sales: "sales rep",
      operator: "operator",
      writer: "writer",
    };
    return map[persona] ?? persona;
  }
  const summary = contextProfile?.summary?.inferredRole?.trim();
  if (summary) return summary;
  return null;
}

const ORIENTATION_GOAL_PATTERNS = [
  /\b(i want to|i need to|i'm trying to|im trying to|help me|show me how to|take me to|go to|find the|log in|sign in|sign up|create a|open the|navigate to|where is|how do i)\b/i,
];

/** True when spoken/text input looks like a navigation goal for Glass Guide. */
export function looksLikeOrientationGoal(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 4) return false;
  if (/^(why|how does|what is|explain|tell me about)\b/i.test(trimmed) && trimmed.includes("?")) {
    return false;
  }
  return ORIENTATION_GOAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}
