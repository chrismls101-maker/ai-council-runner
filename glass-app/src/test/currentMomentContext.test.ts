import { test } from "node:test";
import assert from "node:assert/strict";
import type { GlassSession } from "../shared/sessionTypes.ts";
import { DEFAULT_COPILOT_CONFIG } from "../shared/copilotTypes.ts";
import {
  buildCurrentMomentContext,
  resolveMomentContextStatus,
  listenInterruptStatusLabel,
  TRANSCRIPT_PAUSE_MS,
  TRANSCRIPT_STALE_MS,
} from "../shared/currentMomentContext.ts";
import { classifyActiveListeningIntent } from "../shared/activeListeningIntent.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";

function makeSession(text: string): GlassSession {
  const ts = new Date().toISOString();
  return {
    id: "s1",
    title: "Listen",
    status: "active",
    startedAt: ts,
    updatedAt: ts,
    events: [
      {
        id: "e1",
        sessionId: "s1",
        kind: "transcript_note",
        timestamp: ts,
        title: text.slice(0, 40),
        text,
        tags: ["system_audio"],
      },
    ],
    insights: [],
  };
}

function readyMoment(id: string): ListenMoment {
  const ts = new Date().toISOString();
  const anchor =
    "Distribution and trust may matter more than raw software speed for early founders.";
  return {
    id,
    type: "key_idea",
    summary: anchor,
    transcriptAnchors: [anchor],
    firstSeenAt: ts,
    lastUpdatedAt: ts,
    confidence: 0.9,
    importance: "high",
    suggestedThought: `The important part is that the speaker says ${anchor.toLowerCase()}`,
    reasonSelected: "High-signal idea.",
    status: "ready",
    isActionableNow: true,
    isStillDeveloping: false,
  };
}

test('"what are your thoughts on what he just said?" → ask_thoughts', () => {
  assert.equal(
    classifyActiveListeningIntent("What are your thoughts on what he just said?"),
    "ask_thoughts",
  );
});

test("typed interrupt uses recent system_audio context", () => {
  const transcript =
    "The speaker argues that distribution and trust become the real bottleneck when AI makes building easier.";
  const ctx = buildCurrentMomentContext({
    session: makeSession(transcript),
    sessionLive: true,
    copilotConfig: { ...DEFAULT_COPILOT_CONFIG, mode: "coaching", sessionType: "video_learning" },
    activeMode: "listen",
    userPrompt: "What are your thoughts on what he just said?",
    listenMoments: [readyMoment("m1")],
    lastSystemAudioChunkMs: Date.now(),
  });
  assert.ok(ctx?.currentMoment);
  assert.ok(ctx!.currentMoment!.recentMomentTranscript.includes("distribution"));
  assert.equal(ctx!.detectedIntent, "ask_thoughts");
  assert.equal(ctx!.contextThin, false);
});

test("Listen mode excludes microphone chunks from context", () => {
  const now = Date.now();
  const session: GlassSession = {
    ...makeSession("System audio line about distribution."),
    events: [
      {
        id: "e1",
        sessionId: "s1",
        kind: "transcript_note",
        timestamp: new Date(now).toISOString(),
        title: "System",
        text: "System audio line about distribution and trust.",
        tags: ["system_audio"],
      },
      {
        id: "e2",
        sessionId: "s1",
        kind: "transcript_note",
        timestamp: new Date(now).toISOString(),
        title: "Mic",
        text: "User voice question should not appear as speaker content.",
        tags: ["microphone"],
      },
    ],
  };
  const ctx = buildCurrentMomentContext({
    session,
    sessionLive: true,
    copilotConfig: DEFAULT_COPILOT_CONFIG,
    activeMode: "listen",
    userPrompt: "How does that work?",
    lastSystemAudioChunkMs: now,
  });
  assert.ok(ctx!.recentTranscriptWindow.includes("distribution"));
  assert.ok(!ctx!.recentTranscriptWindow.includes("User voice question"));
});

test("missing transcript returns thin context", () => {
  const ctx = buildCurrentMomentContext({
    session: makeSession(""),
    sessionLive: true,
    runningTranscript: "",
    copilotConfig: DEFAULT_COPILOT_CONFIG,
    activeMode: "listen",
    userPrompt: "What are your thoughts on what he just said?",
  });
  assert.equal(ctx?.contextThin, true);
  assert.equal(ctx?.currentMoment?.momentContextStatus, "thin");
});

test("paused video keeps last moment available", () => {
  const now = Date.now();
  const status = resolveMomentContextStatus({
    recentMomentTranscript: "Distribution and trust are the real bottleneck when building gets easier.",
    lastSystemAudioChunkMs: now - TRANSCRIPT_PAUSE_MS - 5_000,
    nowMs: now,
  });
  assert.equal(status.status, "paused");
  assert.match(status.message ?? "", /last captured moment/i);
});

test("stale timeout labels context as stale", () => {
  const now = Date.now();
  const status = resolveMomentContextStatus({
    recentMomentTranscript: "Distribution and trust are the real bottleneck when building gets easier.",
    lastSystemAudioChunkMs: now - TRANSCRIPT_STALE_MS - 1_000,
    nowMs: now,
  });
  assert.equal(status.status, "stale");
});

test("turn that into action steps → turn_into_action", () => {
  assert.equal(classifyActiveListeningIntent("Turn that into action steps."), "turn_into_action");
});

test("listenInterruptStatusLabel for paused context", () => {
  const label = listenInterruptStatusLabel({
    enabled: true,
    activeMode: "listen",
    windowMinutes: 3,
    chunkCount: 1,
    systemAudioChunkCount: 1,
    microphoneChunkCount: 0,
    recentTranscriptWindow: "Some transcript",
    chunks: [],
    currentMoment: {
      recentMomentTranscript: "Some transcript",
      savedMomentsSilently: [],
      momentContextStatus: "paused",
      momentStatusMessage: "Answering from the last captured moment…",
    },
  });
  assert.match(label ?? "", /last captured moment/i);
});

test("do you agree → agree_disagree", () => {
  assert.equal(classifyActiveListeningIntent("Do you agree?"), "agree_disagree");
});

test("create quick script from that → create_script", () => {
  assert.equal(
    classifyActiveListeningIntent("Can you create a quick script from that?"),
    "create_script",
  );
});
