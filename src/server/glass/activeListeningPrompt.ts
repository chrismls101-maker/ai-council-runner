/**
 * Active Listening — server-side prompt block (mirrors desktop-glass guidance).
 */

export type ActiveListeningIntent =
  | "explain_current_moment"
  | "summarize_recent"
  | "create_asset"
  | "sales_coaching"
  | "save_moment"
  | "objection_handling"
  | "prompt_generation"
  | "action_steps"
  | "debrief_request"
  | "general_contextual";

export interface ActiveListeningContextPayload {
  enabled: boolean;
  activeMode: string;
  windowMinutes: number;
  chunkCount: number;
  systemAudioChunkCount: number;
  microphoneChunkCount: number;
  recentTranscriptWindow: string;
  chunks?: Array<{ text: string; source: string; timestamp: string }>;
  sessionFocus?: string;
  copilotMode?: string;
  recentInsights?: string[];
  recentQuestions?: string[];
  lastAnswer?: string;
  screenshotMeta?: { capturedAt?: string; sourceTitle?: string; label?: string; screenshotPath?: string };
  detectedIntent?: ActiveListeningIntent;
  contextThin?: boolean;
  salesSignals?: {
    objections?: string[];
    customerPain?: string[];
    buyingSignals?: string[];
    dealRisks?: string[];
    suggestedMoves?: Array<{ kind: string; text: string }>;
  };
}

const SHARED =
  "Active Listening: answer about what is happening RIGHT NOW using recent transcript/context. " +
  "Do not invent audio, video, or customer statements. If unsupported, say what is missing. Keep it short enough for live use.";

export function buildActiveListeningPromptBlock(
  ctx: ActiveListeningContextPayload,
  prompt: string,
): string {
  const lines: string[] = [SHARED, "", `Active mode: ${ctx.activeMode}`];
  if (ctx.contextThin) {
    lines.push("", 'Context is thin — tell the user: "I need more recent transcript to answer that."');
    return lines.join("\n");
  }
  if (ctx.recentTranscriptWindow?.trim()) {
    lines.push("", "Recent transcript window:", ctx.recentTranscriptWindow.trim().slice(-1800));
  }
  if (ctx.chunks?.length) {
    lines.push("", "Chunks by source:");
    for (const c of ctx.chunks.slice(-12)) {
      lines.push(`- [${c.source} · ${c.timestamp}] ${c.text.slice(0, 200)}`);
    }
  }
  if (ctx.recentInsights?.length) lines.push("", "Recent insights:", ctx.recentInsights.slice(-5).join("\n"));
  if (ctx.lastAnswer?.trim()) lines.push("", "Last answer (do not repeat structure):", ctx.lastAnswer.slice(0, 280));

  const intent = ctx.detectedIntent ?? "general_contextual";
  if (ctx.activeMode === "listen" && intent === "explain_current_moment") {
    lines.push("", "Explain the concept from recent media/transcript using specific terms heard.");
  }
  if (ctx.activeMode === "listen" && intent === "create_asset") {
    lines.push("", "Create the requested asset from recent content only.");
  }
  if (ctx.activeMode === "meetings" && intent === "sales_coaching") {
    lines.push("", "Suggest 1–2 short sentences to say next — no pressure, no fabricated quotes.");
  }
  if (ctx.activeMode === "meetings" && intent === "objection_handling") {
    lines.push("", "Name the objection if in transcript; suggest calm clarifying response.");
  }
  if (ctx.salesSignals) {
    const s = ctx.salesSignals;
    if (s.objections?.length) lines.push("", `Objections: ${s.objections.join(" | ")}`);
    if (s.suggestedMoves?.length) {
      lines.push("Suggested moves:");
      for (const m of s.suggestedMoves) lines.push(`- ${m.text}`);
    }
  }
  if (/\bhow does that work\b/i.test(prompt) && ctx.activeMode === "listen") {
    lines.push("", "Explain how the thing just described works — from transcript only.");
  }
  return lines.join("\n");
}
