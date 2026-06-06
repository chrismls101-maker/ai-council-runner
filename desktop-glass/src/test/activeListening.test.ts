import { test } from "node:test";
import assert from "node:assert/strict";
import type { GlassSession } from "../shared/sessionTypes.ts";
import { buildActiveListeningContext, deriveActiveListeningMode } from "../shared/activeListeningContext.ts";
import { classifyActiveListeningIntent, intentNeedsRecentTranscript } from "../shared/activeListeningIntent.ts";
import {
  buildActiveListeningGuidance,
  shouldShortCircuitThinContext,
} from "../shared/activeListeningGuidance.ts";
import {
  clearActiveListeningRuntime,
  pickActiveListeningProactiveMoment,
  proactiveShouldShowCard,
} from "../shared/activeListeningProactive.ts";
import { ACTIVE_LISTENING_PROACTIVE_COOLDOWN_MS } from "../shared/activeListeningTypes.ts";
import { extractSalesActiveSignals } from "../shared/salesActiveCoaching.ts";
import { DEFAULT_COPILOT_CONFIG } from "../shared/copilotTypes.ts";
import { GLASS_MODE_PRESETS } from "../shared/glassModePresets.ts";

function makeSession(events: GlassSession["events"]): GlassSession {
  return {
    id: "s1",
    title: "Test",
    status: "active",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events,
    insights: [],
  };
}

test("active context includes recent system_audio chunks with metadata", () => {
  const now = Date.now();
  const session = makeSession([
    {
      id: "e1",
      sessionId: "s1",
      kind: "transcript_note",
      timestamp: new Date(now - 30_000).toISOString(),
      title: "Transformers use self-attention",
      text: "Transformers use self-attention to weigh tokens.",
      tags: ["system_audio"],
    },
    {
      id: "e2",
      sessionId: "s1",
      kind: "transcript_note",
      timestamp: new Date(now - 60_000).toISOString(),
      title: "Old chunk",
      text: "This is outside the window if we use 1 min only",
      tags: ["system_audio"],
    },
  ]);
  const ctx = buildActiveListeningContext({
    session,
    sessionLive: true,
    copilotConfig: { ...DEFAULT_COPILOT_CONFIG, mode: "coaching", sessionType: "video_learning" },
    activeMode: "listen",
    nowMs: now,
    windowMinutes: 3,
    userPrompt: "How does that work?",
  });
  assert.ok(ctx?.enabled);
  assert.ok(ctx!.systemAudioChunkCount >= 1);
  assert.ok(ctx!.recentTranscriptWindow.includes("self-attention"));
  assert.equal(ctx!.chunks[0]?.source, "system_audio");
  assert.ok(ctx!.chunks[0]?.timestamp);
});

test("active context excludes raw audio and base64 from payload shape", () => {
  const session = makeSession([
    {
      id: "e1",
      sessionId: "s1",
      kind: "transcript_note",
      timestamp: new Date().toISOString(),
      title: "Chunk",
      text: "Plain text only.",
      tags: ["system_audio"],
    },
  ]);
  const ctx = buildActiveListeningContext({
    session,
    sessionLive: true,
    copilotConfig: DEFAULT_COPILOT_CONFIG,
    activeMode: "listen",
  });
  const serialized = JSON.stringify(ctx);
  assert.ok(!serialized.includes("base64"));
  assert.ok(!serialized.includes("audio/wav"));
  assert.ok(!serialized.includes("data:image"));
});

test('"how does that work?" classifies as explain_current_moment', () => {
  assert.equal(classifyActiveListeningIntent("How does that work?"), "explain_current_moment");
  assert.ok(intentNeedsRecentTranscript("explain_current_moment"));
});

test('"create a quick script from that" classifies as create_script', () => {
  assert.equal(
    classifyActiveListeningIntent("Create me a quick script from that."),
    "create_script",
  );
});

test('"what should I say next?" in meeting context classifies as sales_coaching', () => {
  assert.equal(classifyActiveListeningIntent("What should I say next?"), "sales_coaching");
});

test("missing recent transcript marks contextThin and short-circuits", () => {
  const ctx = buildActiveListeningContext({
    session: makeSession([]),
    sessionLive: true,
    runningTranscript: "",
    copilotConfig: DEFAULT_COPILOT_CONFIG,
    activeMode: "listen",
    userPrompt: "How does that work?",
  });
  assert.equal(ctx?.contextThin, true);
  assert.ok(shouldShortCircuitThinContext(ctx));
});

test("proactive card cooldown blocks rapid repeats", () => {
  const config = { ...DEFAULT_COPILOT_CONFIG, mode: "coaching" as const, showOverlaySuggestions: true };
  const now = Date.now();
  const first = pickActiveListeningProactiveMoment({
    newTranscript: "Customer says pricing is too expensive for the pilot.",
    copilotConfig: config,
    nowMs: now,
  });
  assert.ok(first);
  const second = pickActiveListeningProactiveMoment({
    newTranscript: "Customer says pricing is too expensive for the pilot.",
    copilotConfig: config,
    nowMs: now + 1000,
    lastProactiveMs: now,
  });
  assert.equal(second, null);
  assert.ok(ACTIVE_LISTENING_PROACTIVE_COOLDOWN_MS >= 60_000);
});

test("passive mode does not show overlay cards", () => {
  const config = { ...DEFAULT_COPILOT_CONFIG, mode: "passive" as const };
  assert.equal(proactiveShouldShowCard(config), false);
});

test("coaching mode allows proactive cards", () => {
  const config = { ...DEFAULT_COPILOT_CONFIG, mode: "coaching" as const };
  assert.equal(proactiveShouldShowCard(config), true);
});

test("Stop Everything clears active listening runtime", () => {
  const cleared = clearActiveListeningRuntime();
  assert.deepEqual(cleared.recentProactiveTexts, []);
  assert.equal(cleared.lastProactiveMs, undefined);
});

test("Listen and Meetings presets enable active listening", () => {
  assert.equal(GLASS_MODE_PRESETS.listen.activeListeningEnabled, true);
  assert.equal(GLASS_MODE_PRESETS.meetings.activeListeningEnabled, true);
});

test("Work preset enables active listening without requiring audio", () => {
  assert.equal(GLASS_MODE_PRESETS.work.activeListeningEnabled, true);
  assert.equal(GLASS_MODE_PRESETS.work.requiresAudio, false);
});

test("guidance includes recent transcript for explain intent", () => {
  const guidance = buildActiveListeningGuidance(
    {
      enabled: true,
      activeMode: "listen",
      windowMinutes: 3,
      chunkCount: 1,
      systemAudioChunkCount: 1,
      microphoneChunkCount: 0,
      recentTranscriptWindow: "Self-attention maps query key value matrices.",
      chunks: [
        {
          text: "Self-attention maps query key value matrices.",
          source: "system_audio",
          timestamp: new Date().toISOString(),
        },
      ],
      detectedIntent: "explain_current_moment",
      contextThin: false,
    },
    "How does that work?",
  );
  assert.ok(guidance.toLowerCase().includes("self-attention"));
  assert.ok(guidance.includes("Thought Partner"));
});

test("sales coaching extracts objection from transcript without inventing names", () => {
  const signals = extractSalesActiveSignals(
    "Prospect says pricing is too expensive and they need SOC 2 before a pilot.",
  );
  assert.ok(signals.objections.length >= 1);
  assert.ok(signals.suggestedMoves.length >= 1);
});

test("deriveActiveListeningMode maps session focus to simple modes", () => {
  assert.equal(
    deriveActiveListeningMode(
      { ...DEFAULT_COPILOT_CONFIG, mode: "coaching", sessionType: "video_learning" },
      true,
    ),
    "listen",
  );
  assert.equal(
    deriveActiveListeningMode(
      { ...DEFAULT_COPILOT_CONFIG, mode: "coaching", sessionType: "meeting_call" },
      true,
    ),
    "meetings",
  );
  assert.equal(
    deriveActiveListeningMode({ ...DEFAULT_COPILOT_CONFIG, mode: "diagnostic" }, true),
    "fix",
  );
});
