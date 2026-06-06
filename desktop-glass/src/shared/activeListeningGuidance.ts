/**
 * Active Listening — answer guidance for GPT direct ask.
 *
 * Builds mode- and intent-specific instructions so interruptions use recent
 * transcript context instead of generic assistant answers.
 */

import { buildListenInterruptPersonaGuidance } from "./listenModePersona.ts";
import type { ActiveListeningContextPayload, ActiveListeningIntent } from "./activeListeningTypes.ts";

const SHARED_RULES =
  "Active Listening: the user is asking about what is happening RIGHT NOW in their session. " +
  "Ground every answer in the recent transcript/context provided — do not invent audio, video, or customer statements. " +
  "If the transcript does not support a claim, say what is missing. Keep answers short enough to use live.";

const LISTEN_INTENT_GUIDANCE: Partial<Record<ActiveListeningIntent, string>> = {
  ask_thoughts:
    "Give your thoughtful take on what the speaker just said. Quote or paraphrase specific lines from the recent transcript. Explain why it matters. Do not ask the user to take action unless they asked for it.",
  explain_current_moment:
    "Explain what the speaker meant using specific terms from the recent transcript/media. Say what they appear to be arguing and why it matters.",
  agree_disagree:
    "Give a balanced take. Separate what the speaker said (from transcript) from your interpretation. Do not overclaim certainty. Do not invent quotes.",
  apply_current_moment:
    "Explain how the recent point might apply in general terms. Ground it in what was actually said. Do not assume a specific product unless the user or transcript mentions it.",
  summarize_recent:
    "Extract 3–5 key points from the last few minutes of transcript. Mention specific terms/topics heard.",
  what_did_i_miss:
    "Summarize the most important ideas from the recent transcript window. Be specific — no generic advice.",
  create_asset:
    "Generate the requested asset using ONLY content from the recent transcript. Do not pad with generic advice.",
  create_script:
    "Write a short script grounded in what the speaker just said. Use their key phrases where possible.",
  prompt_generation:
    "Create a practical prompt the user can paste into their AI tool, grounded in the recent transcript moment.",
  action_steps:
    "Turn the recent content into concrete action steps tied to what was actually said.",
  turn_into_action:
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
    lines.push("", "Context is thin — tell the user: \"I'm still building context from the video. I need a little more transcript, or ask about a specific line.\"");
    return lines.join("\n");
  }

  if (ctx.currentMoment) {
    const cm = ctx.currentMoment;
    lines.push("", `Current moment status: ${cm.momentContextStatus}`);
    if (cm.momentContextStatus === "stale") {
      lines.push(
        "Start your answer by noting you are answering from the last captured part and the video may have moved on.",
      );
    }
    if (cm.recentMomentTranscript.trim()) {
      lines.push("", "Current moment transcript (last ~2 minutes, system audio):", cm.recentMomentTranscript.trim().slice(-1400));
    }
    if (cm.activeMoment) {
      lines.push("", "Active moment:", `- ${cm.activeMoment.summary}`, `- Anchors: ${cm.activeMoment.anchors.slice(0, 2).join(" | ")}`);
    }
    if (cm.recentMatureMoment && cm.recentMatureMoment.id !== cm.activeMoment?.id) {
      lines.push("", "Recent mature moment:", `- ${cm.recentMatureMoment.summary}`);
    }
    if (cm.latestSurfacedThought) {
      lines.push("", "Latest IIVO thought (if any):", cm.latestSurfacedThought.slice(0, 400));
    }
    if (cm.savedMomentsSilently.length) {
      lines.push("", "Silently saved moments (for report):");
      for (const s of cm.savedMomentsSilently.slice(-3)) {
        lines.push(`- ${s.summary.slice(0, 120)}`);
      }
    }
    lines.push(
      "",
      "Speaker/source: use \"the speaker\" unless channel/title is in media context. Never claim identity from faces.",
    );
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

  if (ctx.activeMode === "listen") {
    lines.push("", "Persona:", buildListenInterruptPersonaGuidance({ intent, ctx: { mediaContext: ctx.mediaContext } }));
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
