/**
 * Active Listening — answer guidance for GPT direct ask.
 *
 * Builds mode- and intent-specific instructions so interruptions use recent
 * transcript context instead of generic assistant answers.
 */

import type { ActiveListeningContextPayload, ActiveListeningIntent } from "./activeListeningTypes.ts";

const SHARED_RULES =
  "Active Listening: the user is asking about what is happening RIGHT NOW in their session. " +
  "Ground every answer in the recent transcript/context provided — do not invent audio, video, or customer statements. " +
  "If the transcript does not support a claim, say what is missing. Keep answers short enough to use live.";

const LISTEN_INTENT_GUIDANCE: Partial<Record<ActiveListeningIntent, string>> = {
  explain_current_moment:
    "Explain the concept or step from the recent transcript/media. Use specific terms from what was just said. If the transcript is thin, say you need more recent audio context.",
  summarize_recent:
    "Extract 3–5 key points from the last few minutes of transcript. Mention specific terms/topics heard. If thin, list what details are missing.",
  create_asset:
    "Generate the requested asset (script, outline, checklist, plan) using ONLY content from the recent transcript. Do not pad with generic advice.",
  prompt_generation:
    "Create a practical prompt the user can paste into their AI tool, grounded in the recent transcript moment.",
  action_steps:
    "Turn the recent content into concrete action steps tied to what was actually said.",
  save_moment:
    "Confirm what to save and summarize the moment in one sentence from the transcript.",
};

const MEETINGS_INTENT_GUIDANCE: Partial<Record<ActiveListeningIntent, string>> = {
  sales_coaching:
    "Suggest a short talk track or next question for a live call. Do not manipulate or pressure. Do not claim the customer said something unless the transcript supports it.",
  objection_handling:
    "Name the objection if present in transcript; suggest a calm, clarifying response. If objection is unclear, say what to ask to clarify.",
  summarize_recent:
    "Summarize decisions, action items, blockers, and open questions from recent transcript. Flag missing owners/deadlines explicitly.",
  action_steps:
    "Extract action items with owners/deadlines when present; call out missing fields.",
  create_asset:
    "Create a follow-up message, agenda, or talk track from recent meeting transcript only.",
};

export function buildActiveListeningGuidance(
  ctx: ActiveListeningContextPayload,
  prompt: string,
): string {
  const lines: string[] = [SHARED_RULES, "", `Active mode: ${ctx.activeMode}`];

  if (ctx.contextThin) {
    lines.push("", "Context is thin — tell the user: \"I need more recent transcript to answer that.\"");
    return lines.join("\n");
  }

  if (ctx.recentTranscriptWindow.trim()) {
    lines.push("", "Recent transcript window (last few minutes):", ctx.recentTranscriptWindow.trim().slice(-1800));
  }

  if (ctx.chunks.length) {
    lines.push("", "Transcript chunks by source:");
    for (const chunk of ctx.chunks.slice(-12)) {
      lines.push(`- [${chunk.source} · ${chunk.timestamp}] ${chunk.text.slice(0, 200)}`);
    }
  }

  if (ctx.recentInsights?.length) {
    lines.push("", "Recent Copilot insights:", ctx.recentInsights.slice(-5).join("\n"));
  }
  if (ctx.recentQuestions?.length) {
    lines.push("", "Recent user questions:", ctx.recentQuestions.slice(-3).join("\n"));
  }
  if (ctx.lastAnswer?.trim()) {
    lines.push("", "Last answer (vary structure; do not repeat):", ctx.lastAnswer.trim().slice(0, 280));
  }
  if (ctx.screenshotMeta?.label || ctx.screenshotMeta?.sourceTitle) {
    lines.push(
      "",
      "Latest screen context (metadata only):",
      [ctx.screenshotMeta.label, ctx.screenshotMeta.sourceTitle, ctx.screenshotMeta.capturedAt]
        .filter(Boolean)
        .join(" · "),
    );
  }

  if (ctx.mediaContext) {
    const m = ctx.mediaContext;
    lines.push("", "Media / page context (from visible text and browser metadata — not facial recognition):");
    lines.push(`- Source type: ${m.sourceType} (confidence: ${m.confidence})`);
    if (m.title) lines.push(`- Title: ${m.title}`);
    if (m.channelOrSource) lines.push(`- Channel/source: ${m.channelOrSource}`);
    if (m.url) lines.push(`- URL: ${m.url}`);
    if (m.durationLabel) lines.push(`- Duration: ${m.durationLabel}`);
    if (m.visibleTextSummary) lines.push(`- Visible text: ${m.visibleTextSummary.slice(0, 600)}`);
    if (m.extractionNotes?.length) {
      lines.push(`- Extraction notes: ${m.extractionNotes.join("; ")}`);
    }
  }

  const intent = ctx.detectedIntent ?? "general_contextual";
  const modeGuidance =
    ctx.activeMode === "listen"
      ? LISTEN_INTENT_GUIDANCE[intent]
      : ctx.activeMode === "meetings"
        ? MEETINGS_INTENT_GUIDANCE[intent]
        : undefined;

  if (modeGuidance) {
    lines.push("", "Intent-specific guidance:", modeGuidance);
  }

  if (ctx.activeMode === "meetings" && ctx.salesSignals) {
    lines.push("", "Sales/call signals detected (transcript-backed only):");
    const s = ctx.salesSignals;
    if (s.objections.length) lines.push(`- Objections: ${s.objections.join(" | ")}`);
    if (s.customerPain.length) lines.push(`- Pain: ${s.customerPain.join(" | ")}`);
    if (s.buyingSignals.length) lines.push(`- Buying signals: ${s.buyingSignals.join(" | ")}`);
    if (s.dealRisks.length) lines.push(`- Risks: ${s.dealRisks.join(" | ")}`);
    if (s.suggestedMoves.length) {
      lines.push("- Suggested moves:");
      for (const m of s.suggestedMoves) lines.push(`  · ${m.text}`);
    }
  }

  if (ctx.activeMode === "listen" && /\bhow does that work\b/i.test(prompt)) {
    lines.push("", "Answer how the concept/step from the recent media works — be specific to what was just explained.");
  }
  if (ctx.activeMode === "meetings" && /\bwhat should i say next\b/i.test(prompt)) {
    lines.push("", "Give 1–2 short sentences the user can say next — conversational, not a script monologue.");
  }

  return lines.join("\n");
}

/** Short client-side answer when context is too thin (avoids wasteful API call). */
export function shouldShortCircuitThinContext(ctx: ActiveListeningContextPayload | undefined): boolean {
  return Boolean(ctx?.enabled && ctx.contextThin);
}
