import { test } from "node:test";
import assert from "node:assert/strict";
import type { GlassSession } from "../shared/sessionTypes.ts";
import { buildActiveListeningContext } from "../shared/activeListeningContext.ts";
import { DEFAULT_COPILOT_CONFIG } from "../shared/copilotTypes.ts";
import {
  evaluateListenMoments,
  generateListenThought,
  pickBestListenMomentForSurface,
} from "../shared/listenMomentIntelligence.ts";
import {
  LISTEN_MIN_TRANSCRIPT_CHARS,
  shouldSurfaceListenMoment,
} from "../shared/listenMomentTiming.ts";
import { withMomentMaturity } from "../shared/listenMomentMaturity.ts";
import { DEFAULT_LISTEN_WARMUP_MS } from "../shared/listenMomentTypes.ts";
import type { ListenMoment, ListenSurfaceContext } from "../shared/listenMomentTypes.ts";
import {
  buildListenReportSections,
  listenMomentsFromSessionEvents,
} from "../shared/listenReport.ts";
import { activeListeningMissingContextMessage } from "../shared/activeListeningContext.ts";
import { classifyActiveListeningIntent } from "../shared/activeListeningIntent.ts";

function baseSurfaceContext(overrides: Partial<ListenSurfaceContext> = {}): ListenSurfaceContext {
  return {
    attentionLevel: "balanced",
    nowMs: Date.now(),
    recentTranscriptChars: 200,
    recentSurfacedTexts: [],
    userReceivingAnswer: false,
    muteSuggestions: false,
    surfacesInLast10Min: 0,
    ...overrides,
  };
}

function readyMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const now = new Date().toISOString();
  return {
    id: "m1",
    type: "key_idea",
    summary: "Distribution may matter more than software speed.",
    transcriptAnchors: ["Distribution may matter more than software speed for founders."],
    firstSeenAt: now,
    lastUpdatedAt: now,
    confidence: 0.85,
    importance: "high",
    suggestedThought: "Useful founder insight: distribution may matter more than software speed.",
    status: "ready",
    ...overrides,
  };
}

function matureReadyMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const nowMs = Date.now();
  const anchor =
    "Distribution may matter more than software speed for early founders building in public.";
  const base = readyMoment({
    transcriptAnchors: [anchor, `${anchor} Repeated for emphasis.`, `${anchor} Third anchor line.`],
    firstSeenAt: new Date(nowMs - 50_000).toISOString(),
    lastUpdatedAt: new Date(nowMs).toISOString(),
    suggestedThought: `The important part here is that the speaker says ${anchor.charAt(0).toLowerCase()}${anchor.slice(1)}`,
    reasonSelected: "This stood out as a high-signal idea in the recent transcript.",
    status: "ready",
    ...overrides,
  });
  return withMomentMaturity(base, nowMs, "content");
}

test("thin transcript → stay quiet (wait_for_more_context)", () => {
  const moment = matureReadyMoment();
  const result = shouldSurfaceListenMoment(
    moment,
    baseSurfaceContext({ recentTranscriptChars: LISTEN_MIN_TRANSCRIPT_CHARS - 1 }),
  );
  assert.equal(result.decision, "wait_for_more_context");
});

test("developing idea → wait", () => {
  const moment = withMomentMaturity(
    readyMoment({ status: "developing", confidence: 0.6, transcriptAnchors: ["Still forming."] }),
    Date.now(),
    "content",
  );
  const result = shouldSurfaceListenMoment(moment, baseSurfaceContext());
  assert.equal(result.decision, "wait_for_more_context");
});

test("high-value ready moment → save silently in Balanced (note-first)", () => {
  const moment = matureReadyMoment();
  const now = Date.now();
  const result = shouldSurfaceListenMoment(
    moment,
    baseSurfaceContext({
      attentionLevel: "balanced",
      nowMs: now,
      listenStartedMs: now - DEFAULT_LISTEN_WARMUP_MS - 5_000,
      listenWarmupMs: DEFAULT_LISTEN_WARMUP_MS,
      liveThoughtsEnabled: true,
    }),
  );
  assert.equal(result.decision, "save_silently");
  assert.match(result.reason, /Live Notes/i);
});

test("warm-up phase → save silently", () => {
  const moment = matureReadyMoment();
  const now = Date.now();
  const result = shouldSurfaceListenMoment(
    moment,
    baseSurfaceContext({
      nowMs: now,
      listenStartedMs: now - 30_000,
      listenWarmupMs: DEFAULT_LISTEN_WARMUP_MS,
    }),
  );
  assert.equal(result.decision, "save_silently");
  assert.match(result.reason, /warm-up/i);
});

test("ad segment → save silently", () => {
  const moment = matureReadyMoment({ segmentKind: "ad" });
  const now = Date.now();
  const result = shouldSurfaceListenMoment(
    moment,
    baseSurfaceContext({
      nowMs: now,
      listenStartedMs: now - DEFAULT_LISTEN_WARMUP_MS - 5_000,
      listenWarmupMs: DEFAULT_LISTEN_WARMUP_MS,
      segmentKind: "ad",
      segmentSuppressProactive: true,
    }),
  );
  assert.equal(result.decision, "save_silently");
});

test("Quiet mode → save silently", () => {
  const moment = matureReadyMoment();
  const result = shouldSurfaceListenMoment(moment, baseSurfaceContext({ attentionLevel: "quiet" }));
  assert.equal(result.decision, "save_silently");
});

test("cooldown active → save silently", () => {
  const moment = matureReadyMoment();
  const now = Date.now();
  const result = shouldSurfaceListenMoment(
    moment,
    baseSurfaceContext({
      nowMs: now,
      lastSurfaceMs: now - 30_000,
      attentionLevel: "balanced",
      listenStartedMs: now - DEFAULT_LISTEN_WARMUP_MS - 5_000,
      listenWarmupMs: DEFAULT_LISTEN_WARMUP_MS,
    }),
  );
  assert.equal(result.decision, "save_silently");
});

test("stale moment → mark_stale", () => {
  const moment = matureReadyMoment({ status: "stale" });
  const result = shouldSurfaceListenMoment(moment, baseSurfaceContext());
  assert.equal(result.decision, "mark_stale");
});

test("generated thought updates when more transcript arrives", () => {
  const first = evaluateListenMoments({
    newText: "The key framework here is distribution before product speed.",
    recentTranscript: "",
    existingMoments: [],
    nowMs: 1000,
    idFactory: () => "lm-1",
  });
  assert.ok(first.length >= 1);
  const updated = evaluateListenMoments({
    newText: "Distribution before product speed wins when you have limited runway.",
    recentTranscript: first[0]!.transcriptAnchors.join(" "),
    existingMoments: first,
    nowMs: 5000,
    idFactory: () => "lm-2",
  });
  assert.equal(updated[0]!.id, "lm-1");
  assert.ok(updated[0]!.confidence >= first[0]!.confidence);
  assert.ok(updated[0]!.suggestedThought);
});

test("repeated thought is suppressed", () => {
  const moment = matureReadyMoment();
  const thought = moment.suggestedThought!;
  const result = shouldSurfaceListenMoment(
    moment,
    baseSurfaceContext({ recentSurfacedTexts: [thought] }),
  );
  assert.equal(result.decision, "do_nothing");
});

test("Listen mode excludes microphone chunks from context", () => {
  const session: GlassSession = {
    id: "s1",
    title: "Listen",
    status: "active",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [
      {
        id: "e1",
        sessionId: "s1",
        kind: "transcript_note",
        timestamp: new Date().toISOString(),
        title: "System chunk",
        text: "Speaker explains distribution strategy.",
        tags: ["system_audio"],
      },
      {
        id: "e2",
        sessionId: "s1",
        kind: "transcript_note",
        timestamp: new Date().toISOString(),
        title: "Mic chunk",
        text: "User talking to themselves privately.",
        tags: ["microphone"],
      },
    ],
    insights: [],
  };
  const ctx = buildActiveListeningContext({
    session,
    sessionLive: true,
    copilotConfig: { ...DEFAULT_COPILOT_CONFIG, sessionType: "video_learning" },
    activeMode: "listen",
  });
  assert.equal(ctx?.microphoneChunkCount, 0);
  assert.equal(ctx?.systemAudioChunkCount, 1);
  assert.ok(!ctx?.recentTranscriptWindow.includes("privately"));
});

test("missing context returns warm-up message when inWarmup", () => {
  const msg = activeListeningMissingContextMessage(undefined, true);
  assert.match(msg, /building context from the audio/i);
});

test("missing context returns missing-context response", () => {
  const msg = activeListeningMissingContextMessage(classifyActiveListeningIntent("How does that work?"));
  assert.match(msg, /building context from the audio/i);
});

test("report includes silently saved moments", () => {
  const now = new Date().toISOString();
  const session: GlassSession = {
    id: "s1",
    title: "Listen session",
    status: "ended",
    startedAt: now,
    updatedAt: now,
    events: [
      {
        id: "e1",
        sessionId: "s1",
        kind: "saved_moment",
        timestamp: now,
        title: "Saved thought",
        text: "Good sales idea worth saving.",
        tags: ["listen_moment", "sales_tactic", "saved_silently"],
        metadata: {
          listenMoment: readyMoment({
            status: "saved_silently",
            type: "sales_tactic",
            suggestedThought: "Good sales idea worth saving.",
          }),
        },
      },
    ],
    insights: [],
  };
  const moments = listenMomentsFromSessionEvents(session.events);
  const sections = buildListenReportSections({ session, moments });
  const keyIdeas = sections.find((s) => s.heading === "Core ideas");
  assert.ok(keyIdeas?.items.some((i) => i.includes("sales") || i.toLowerCase().includes("tactic")));
});

test("pickBestListenMoment prefers ready high-importance moments", () => {
  const nowMs = Date.now();
  const mature = matureReadyMoment({ id: "b", importance: "high" });
  const immature = withMomentMaturity(
    readyMoment({ id: "a", importance: "low", status: "developing" }),
    nowMs,
    "content",
  );
  const best = pickBestListenMomentForSurface([immature, mature]);
  assert.equal(best?.id, "b");
});

test("generateListenThought produces type-specific coaching", () => {
  const thought = generateListenThought({
    type: "implementation_idea",
    transcriptAnchors: ["Turn this workflow into a Cursor prompt."],
    summary: "Turn this workflow into a Cursor prompt.",
  });
  assert.match(thought.suggestedThought!, /implementation|Cursor|prompt/i);
  assert.ok(thought.reasonSelected);
});
