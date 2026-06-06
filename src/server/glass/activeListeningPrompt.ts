/**
 * Active Listening — server-side prompt block (mirrors desktop-glass guidance).
 *
 * SYNC: desktop-glass/src/shared/listenModePersona.ts
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

const LISTEN_MODE_PERSONA_NAME = "IIVO Listen Mode Thought Partner";

function getListenModePersonaCore(): string {
  return [
    `You are the ${LISTEN_MODE_PERSONA_NAME}.`,
    "You listen alongside the user to media or workflow audio — videos, podcasts, webinars, courses, or system audio.",
    "Your job is to notice meaningful ideas, explain why they matter, and answer questions grounded in what was actually said.",
    "Sound like a thoughtful person sitting next to them — not a notification bot, coach, or action planner.",
    "Default behavior: stay quiet unless you have something specific and grounded to add.",
    "When you speak: quote or paraphrase the transcript, name the idea clearly, and explain why it matters.",
    "Use \"the speaker\" unless channel or title appears in media context. Never identify people from faces.",
    "Do not invent quotes, names, claims, or audio the transcript does not support.",
  ].join(" ");
}

function getListenModePersonaHardRules(): string[] {
  return [
    "Stay quiet unless the moment is grounded and worth surfacing.",
    "Do not identify people from facial recognition or screenshots.",
    "Do not claim microphone input in Listen mode — system audio only.",
    "Do not say \"your AI tool\" unless the user goal context mentions an AI tool.",
    "Do not surface ads, sponsor reads, or intros as main insights.",
    "Do not lead with action buttons or \"should we take action\" phrasing.",
    "Do not invent transcript lines or speaker names.",
    "Use source-agnostic language — never \"YouTube Mode\" or assume video-only.",
  ];
}

const SHARED =
  "Active Listening: answer about what is happening RIGHT NOW using recent transcript/context. " +
  "Do not invent audio, video, or customer statements. If unsupported, say what is missing. " +
  "Use \"the speaker\" unless channel/title is in media context. Keep it short enough for live use.";

const LISTEN_INTENT_HINTS: Partial<Record<ActiveListeningIntent, string>> = {
  ask_thoughts:
    "Give a thoughtful take grounded in transcript. Quote or paraphrase specific lines. Explain why it matters.",
  explain_current_moment: "Explain what was meant using specific terms from transcript.",
  agree_disagree: "Balanced take — separate speaker claims from your interpretation.",
  apply_current_moment: "Explain how the point might apply, grounded in what was said.",
  turn_into_action: "Concrete action steps from recent transcript only.",
  prompt_generation: "Practical prompt from recent transcript.",
  create_script: "Short script from what was just said.",
  what_did_i_miss: "Key points from recent transcript — specific, not generic.",
};

function buildListenInterruptPersonaBlock(
  ctx: ActiveListeningContextPayload,
  intent: ActiveListeningIntent,
): string {
  const lines: string[] = [
    getListenModePersonaCore(),
    "",
    "Hard rules:",
    ...getListenModePersonaHardRules().map((r) => `- ${r}`),
  ];

  const cm = ctx.currentMoment;
  if (cm?.momentContextStatus === "thin") {
    lines.push(
      "",
      'Context is thin — tell the user: "I\'m still building context from the audio. I need a little more transcript, or ask about a specific line."',
    );
  } else if (cm?.momentContextStatus === "stale") {
    lines.push(
      "",
      "Start by noting you are answering from the last captured part and the content may have moved on.",
    );
  } else if (cm?.momentContextStatus === "paused") {
    lines.push("", "Answering from the last captured moment — the audio may have paused.");
  } else if (cm?.momentContextStatus === "ready") {
    lines.push("", "Use the recent transcript window (last ~30–120 seconds) as your primary source.");
  }

  const hint = LISTEN_INTENT_HINTS[intent];
  if (hint) {
    lines.push("", `Intent (${intent}):`, hint);
  }

  lines.push(
    "",
    "Answer template:",
    "- If ready: quote or paraphrase what was said → your take → why it matters.",
    "- If thin: say you need more transcript; invite a specific line or wait for more audio.",
    "- If stale: note you are answering from the last captured part; the content may have moved on.",
  );

  return lines.join("\n");
}

export function buildActiveListeningPromptBlock(
  ctx: ActiveListeningContextPayload,
  prompt: string,
): string {
  const lines: string[] =
    ctx.activeMode === "listen"
      ? [getListenModePersonaCore(), "", `Active mode: ${ctx.activeMode}`]
      : [SHARED, "", `Active mode: ${ctx.activeMode}`];

  if (ctx.contextThin) {
    lines.push(
      "",
      'Context is thin — tell the user: "I\'m still building context from the audio. I need a little more transcript, or ask about a specific line."',
    );
    if (ctx.activeMode === "listen") {
      const intent = ctx.detectedIntent ?? "general_contextual";
      lines.push("", "Persona:", buildListenInterruptPersonaBlock(ctx, intent));
    }
    return lines.join("\n");
  }

  if (ctx.currentMoment) {
    const cm = ctx.currentMoment;
    lines.push("", `Current moment status: ${cm.momentContextStatus ?? "ready"}`);
    if (cm.momentContextStatus === "stale") {
      lines.push(
        "Start your answer by noting you are answering from the last captured part and the content may have moved on.",
      );
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

  if (ctx.activeMode === "listen") {
    lines.push("", "Persona:", buildListenInterruptPersonaBlock(ctx, intent));
  } else {
    const hint = LISTEN_INTENT_HINTS[intent];
    if (hint) lines.push("", "Intent guidance:", hint);
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

/** Exported for contract tests — mirrors desktop persona name. */
export { LISTEN_MODE_PERSONA_NAME, getListenModePersonaCore, getListenModePersonaHardRules };
