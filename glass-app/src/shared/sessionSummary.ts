/**
 * Deterministic session summary generation for IIVO Glass. No LLM calls.
 * Accepted insights are weighted first within each section.
 */

import type {
  GlassInsightType,
  GlassSession,
  GlassSessionEvent,
  GlassSessionInsight,
} from "./sessionTypes.ts";

function describeWhatHappened(events: GlassSessionEvent[]): string[] {
  const captures = events.filter((e) => e.kind === "screen_capture").length;
  const notes = events.filter((e) => e.kind === "manual_note" || e.kind === "transcript_note").length;
  const moments = events.filter((e) => e.kind === "saved_moment").length;
  const sent = events.filter((e) => e.kind === "iivo_sent").length;

  const lines: string[] = [];
  if (captures > 0) lines.push(`Captured ${captures} screen${captures === 1 ? "" : "s"}.`);
  if (notes > 0) lines.push(`Recorded ${notes} note${notes === 1 ? "" : "s"}.`);
  if (moments > 0) lines.push(`Saved ${moments} moment${moments === 1 ? "" : "s"}.`);
  if (sent > 0) lines.push(`Sent ${sent} item${sent === 1 ? "" : "s"} to IIVO.`);

  // Add a few notable event titles for color.
  const notable = events
    .filter((e) =>
      ["manual_note", "saved_moment", "screen_capture", "transcript_note"].includes(e.kind),
    )
    .slice(0, 3)
    .map((e) => `• ${e.title}`);
  return [...lines, ...notable];
}

function insightsByType(
  insights: GlassSessionInsight[],
  type: GlassInsightType,
): GlassSessionInsight[] {
  return insights
    .filter((i) => i.type === type)
    .sort((a, b) => Number(b.accepted ?? false) - Number(a.accepted ?? false));
}

function section(title: string, items: string[]): string[] {
  if (items.length === 0) return [];
  return [`${title}:`, ...items.map((t) => `- ${t}`), ""];
}

export interface SuggestedPromptParts {
  prompt: string;
}

export function buildSuggestedPrompt(session: GlassSession): string {
  const actions = insightsByType(session.insights, "action");
  const ideas = insightsByType(session.insights, "key_idea");
  const risks = insightsByType(session.insights, "risk");
  const focus = actions[0]?.text || ideas[0]?.text || risks[0]?.text;
  if (focus) {
    return `Based on my work session "${session.title}", help me with: ${focus}`;
  }
  return `Review my work session "${session.title}" and tell me the most important next step.`;
}

export function buildSessionSummary(session: GlassSession): string {
  const lines: string[] = ["Session Summary", ""];

  const what = describeWhatHappened(session.events);
  lines.push(...section("What happened", what.length ? what : ["No events recorded yet."]));

  lines.push(
    ...section("Key ideas", insightsByType(session.insights, "key_idea").map((i) => i.text)),
  );
  lines.push(
    ...section("Hypotheses", insightsByType(session.insights, "hypothesis").map((i) => i.text)),
  );
  lines.push(...section("Risks", insightsByType(session.insights, "risk").map((i) => i.text)));
  lines.push(
    ...section("Action items", insightsByType(session.insights, "action").map((i) => i.text)),
  );
  lines.push(
    ...section("Questions", insightsByType(session.insights, "question").map((i) => i.text)),
  );
  lines.push(
    ...section(
      "Memory candidates",
      insightsByType(session.insights, "memory_candidate").map((i) => i.text),
    ),
  );

  lines.push("Suggested next IIVO prompt:", buildSuggestedPrompt(session));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
