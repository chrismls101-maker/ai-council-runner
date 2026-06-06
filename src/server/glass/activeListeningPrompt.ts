/**
 * Active Listening — server-side prompt block (mirrors desktop-glass guidance).
 */

export type ActiveListeningIntent =
  | "ask_thoughts"
  | "explain_current_moment"
  | "agree_disagree"
  | "apply_current_moment"
  | "summarize_recent"
  | "what_did_i_miss"
  | "create_asset"
  | "create_script"
  | "sales_coaching"
  | "save_moment"
  | "objection_handling"
  | "prompt_generation"
  | "action_steps"
  | "turn_into_action"
  | "debrief_request"
  | "general_contextual";

export interface CurrentMomentContextPayload {
  recentMomentTranscript?: string;
  activeMoment?: { summary: string; anchors?: string[]; suggestedThought?: string };
  recentMatureMoment?: { summary: string };
  latestSurfacedThought?: string;
  momentContextStatus?: "ready" | "thin" | "paused" | "stale";
  momentStatusMessage?: string;
}

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
  currentMoment?: CurrentMomentContextPayload;
  salesSignals?: {
    objections?: string[];
    customerPain?: string[];
    buyingSignals?: string[];
    dealRisks?: string[];
    suggestedMoves?: Array<{ kind: string; text: string }>;
  };
  mediaContext?: {
    sourceType: string;
    title?: string;
    channelOrSource?: string;
    url?: string;
    durationLabel?: string;
    visibleTextSummary?: string;
    confidence: string;
    capturedAt: string;
    extractionNotes?: string[];
  };
}

const SHARED =
  "Active Listening: answer about what is happening RIGHT NOW using recent transcript/context. " +
  "Do not invent audio, video, or customer statements. If unsupported, say what is missing. " +
  "Use \"the speaker\" unless channel/title is in media context. Keep it short enough for live use.";

const LISTEN_INTENT_HINTS: Partial<Record<ActiveListeningIntent, string>> = {
  ask_thoughts:
    "Give a thoughtful take grounded in transcript. Say what the speaker appears to argue and why it matters.",
  explain_current_moment: "Explain what was meant using specific terms from transcript.",
  agree_disagree: "Balanced take — separate speaker claims from your interpretation.",
  apply_current_moment: "Explain how the point might apply, grounded in what was said.",
  turn_into_action: "Concrete action steps from recent transcript only.",
  prompt_generation: "Practical prompt from recent transcript.",
  create_script: "Short script from what was just said.",
  what_did_i_miss: "Key points from recent transcript — specific, not generic.",
};

export function buildActiveListeningPromptBlock(
  ctx: ActiveListeningContextPayload,
  prompt: string,
): string {
  const lines: string[] = [SHARED, "", `Active mode: ${ctx.activeMode}`];
  if (ctx.contextThin) {
    lines.push(
      "",
      'Context is thin — tell the user: "I\'m still building context from the video. I need a little more transcript, or ask about a specific line."',
    );
    return lines.join("\n");
  }

  if (ctx.currentMoment) {
    const cm = ctx.currentMoment;
    if (cm.momentContextStatus === "stale") {
      lines.push("", "Note: video may have moved on — answer from last captured part.");
    }
    if (cm.recentMomentTranscript?.trim()) {
      lines.push("", "Current moment transcript:", cm.recentMomentTranscript.trim().slice(-1400));
    }
    if (cm.activeMoment?.summary) lines.push("", "Active moment:", cm.activeMoment.summary);
    if (cm.latestSurfacedThought) lines.push("", "Latest thought:", cm.latestSurfacedThought.slice(0, 400));
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
  const hint = ctx.activeMode === "listen" ? LISTEN_INTENT_HINTS[intent] : undefined;
  if (hint) lines.push("", "Intent guidance:", hint);

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
  if (ctx.mediaContext) {
    const m = ctx.mediaContext;
    lines.push("", "Media context (visible text/URL — not facial recognition):");
    lines.push(`- Type: ${m.sourceType} (${m.confidence})`);
    if (m.title) lines.push(`- Title: ${m.title}`);
    if (m.channelOrSource) lines.push(`- Channel: ${m.channelOrSource}`);
    if (m.url) lines.push(`- URL: ${m.url}`);
    if (m.durationLabel) lines.push(`- Duration: ${m.durationLabel}`);
    if (m.visibleTextSummary) lines.push(`- Visible: ${m.visibleTextSummary.slice(0, 500)}`);
  }
  if (/\bhow does that work\b/i.test(prompt) && ctx.activeMode === "listen") {
    lines.push("", "Explain how the thing just described works — from transcript only.");
  }
  return lines.join("\n");
}
