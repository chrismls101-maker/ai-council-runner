import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildListenLiveNotes,
  listenTranscriptChunksFromEvents,
  mergeListenAiNotes,
  unclearTranscriptNote,
} from "../shared/listenLiveNotes.ts";
import type { ListenAiNote } from "../shared/listenLiveNotes.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";
import { isActionFirstListenCard } from "../shared/listenInsightQuality.ts";
import { shouldSurfaceListenMoment } from "../shared/listenMomentTiming.ts";
import { withMomentMaturity } from "../shared/listenMomentMaturity.ts";
import {
  analyzeListenMomentWithHarness,
  applyHarnessMomentDecision,
  createListenHarnessRuntime,
} from "../shared/listenLiveHarness.ts";
import { DEFAULT_LISTEN_WARMUP_MS } from "../shared/listenMomentTypes.ts";
import type { ListenSurfaceContext } from "../shared/listenMomentTypes.ts";

function readyMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const nowMs = Date.now();
  const anchor = "Desire is the starting point of all achievement for practical success.";
  const base: ListenMoment = {
    id: "m1",
    type: "key_idea",
    summary: "Desire is the starting point of all achievement.",
    transcriptAnchors: [anchor, `${anchor} Again.`, `${anchor} Third time.`],
    firstSeenAt: new Date(nowMs - 50_000).toISOString(),
    lastUpdatedAt: new Date(nowMs).toISOString(),
    confidence: 0.85,
    importance: "high",
    suggestedThought: `The important part here is that the speaker says ${anchor.charAt(0).toLowerCase()}${anchor.slice(1)}`,
    reasonSelected: "This stood out as a high-signal idea in the recent transcript.",
    status: "ready",
    ...overrides,
  };
  return withMomentMaturity(base, nowMs, "content");
}

function baseSurfaceContext(overrides: Partial<ListenSurfaceContext> = {}): ListenSurfaceContext {
  const nowMs = Date.now();
  return {
    attentionLevel: "balanced",
    nowMs,
    recentTranscriptChars: 300,
    recentSurfacedTexts: [],
    userReceivingAnswer: false,
    muteSuggestions: false,
    surfacesInLast10Min: 0,
    liveThoughtsEnabled: true,
    listenStartedMs: nowMs - DEFAULT_LISTEN_WARMUP_MS - 5_000,
    listenWarmupMs: DEFAULT_LISTEN_WARMUP_MS,
    ...overrides,
  };
}

test("Quiet Listen saves silently with zero proactive cards", () => {
  const moment = readyMoment();
  const result = shouldSurfaceListenMoment(
    moment,
    baseSurfaceContext({ attentionLevel: "quiet" }),
  );
  assert.equal(result.decision, "save_silently");
});

test("Active Listen may surface one mature non-action thought card", () => {
  const moment = readyMoment();
  const result = shouldSurfaceListenMoment(
    moment,
    baseSurfaceContext({
      attentionLevel: "active",
      liveThoughtsEnabled: true,
    }),
  );
  assert.equal(result.decision, "surface_now");
  assert.equal(isActionFirstListenCard(moment.suggestedThought ?? ""), false);
});

test("Balanced harness produces Live Notes but zero proactive cards", () => {
  const runtime = createListenHarnessRuntime("balanced");
  const now = Date.now();
  runtime.listenStartedMs = now - DEFAULT_LISTEN_WARMUP_MS - 5_000;
  const moment = readyMoment();
  const analysis = analyzeListenMomentWithHarness({
    moments: [moment],
    runtime,
    recentTranscriptChars: 300,
    nowMs: now,
    listenWarmupMs: DEFAULT_LISTEN_WARMUP_MS,
  });
  assert.notEqual(analysis.decision, "surface_now");
  applyHarnessMomentDecision(analysis, runtime, now);
  assert.equal(runtime.cardsSurfaced, 0);
  assert.equal(runtime.surfacedMoments.length, 0);
  if (analysis.decision === "save_silently") {
    assert.ok(runtime.liveNotesUpdates >= 1);
  }
  const notes = buildListenLiveNotes({ moments: [moment], transcriptChunks: ["Desire is the starting point."] });
  assert.ok(notes.entries.length >= 1);
});

test("Listen Mode balanced default does not surface proactive cards", () => {
  const moment = readyMoment();
  const result = shouldSurfaceListenMoment(moment, baseSurfaceContext({ attentionLevel: "balanced" }));
  assert.notEqual(result.decision, "surface_now");
  assert.equal(result.decision, "save_silently");
});

test("incomplete action fragment saved as note not card", () => {
  const moment = withMomentMaturity(
    {
      id: "m-action",
      type: "action_step",
      summary: "of two sealed envelopes",
      transcriptAnchors: ["of two sealed envelopes"],
      suggestedThought: "Want me to turn it into an action plan?",
      firstSeenAt: new Date(Date.now() - 5_000).toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      confidence: 0.5,
      importance: "medium",
      status: "developing",
    },
    Date.now(),
    "content",
  );
  const result = shouldSurfaceListenMoment(moment, baseSurfaceContext({ attentionLevel: "active" }));
  assert.notEqual(result.decision, "surface_now");
  assert.ok(["save_silently", "wait_for_more_context"].includes(result.decision));
});

test("buildListenLiveNotes creates structured notes from moments", () => {
  // Sections only show AI notes (single-layer design). Local moments → entries.
  const notes = buildListenLiveNotes({
    moments: [readyMoment()],
    transcriptChunks: ["Desire is the starting point of all achievement."],
    listenStartedMs: Date.now() - 60_000,
  });
  const keyIdeaEntries = notes.entries.filter((e) => e.section === "keyIdeas");
  assert.ok(keyIdeaEntries.length >= 1);
  assert.ok(notes.currentTopic);
  assert.equal(notes.transcriptChunkCount, 1);
});

test("notes dedupe repeated transcript chunks", () => {
  const chunk = "Desire is the starting point of all achievement.";
  const notes = buildListenLiveNotes({
    moments: [],
    transcriptChunks: [chunk, chunk, chunk],
  });
  assert.equal(notes.transcriptChunkCount, 3);
  assert.ok(notes.duplicateTranscriptCount >= 1);
});

test("clear action item saved as note not action-first card text", () => {
  const moment = withMomentMaturity(
    {
      id: "m-action-clear",
      type: "action_step",
      summary: "Send the proposal to the client by Friday",
      transcriptAnchors: [
        "Send the proposal to the client by Friday before the standup.",
        "Send the proposal to the client by Friday before the standup. Again.",
        "Send the proposal to the client by Friday before the standup. Third.",
      ],
      firstSeenAt: new Date(Date.now() - 50_000).toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      suggestedThought: "Action: send the proposal to the client by Friday.",
      reasonSelected: "Clear action from transcript.",
      confidence: 0.9,
      importance: "high",
      status: "ready",
    },
    Date.now(),
    "content",
  );
  const notes = buildListenLiveNotes({ moments: [moment] });
  const actionEntries = notes.entries.filter((e) => e.section === "actionIdeas");
  assert.ok(actionEntries.length >= 1);
  assert.equal(isActionFirstListenCard(actionEntries[0]?.text ?? ""), false);
});

test("raw transcript and notes are separate", () => {
  const events = [
    {
      id: "e1",
      sessionId: "s1",
      kind: "transcript_note" as const,
      title: "chunk",
      text: "Raw transcript line one.",
      timestamp: new Date().toISOString(),
      tags: ["system_audio"],
    },
  ];
  const chunks = listenTranscriptChunksFromEvents(events);
  const notes = buildListenLiveNotes({ moments: [readyMoment()], transcriptChunks: chunks });
  assert.equal(chunks[0], "Raw transcript line one.");
  // Sections empty pre-AI-pass; check the entry text instead.
  const keyIdeaEntries = notes.entries.filter((e) => e.section === "keyIdeas");
  assert.ok(keyIdeaEntries.length >= 1, "expected keyIdeas entry from moment");
  const firstText = keyIdeaEntries[0]!.text;
  assert.ok(firstText.includes("definite desire") || firstText.includes("starting point") || firstText.length >= 20);
});

test("unclear transcript fragment note does not become action", () => {
  const note = unclearTranscriptNote("continued, is this list");
  assert.match(note, /not enough context/i);
  assert.equal(isActionFirstListenCard(note), false);
});

test("mergeListenAiNotes accumulates passes without duplicate text", () => {
  const existing: ListenAiNote[] = [
    {
      id: "ai-1",
      section: "keyIdeas",
      note: "Compounding interest works in reverse for debt.",
      generatedAt: new Date().toISOString(),
    },
  ];
  const incoming: ListenAiNote[] = [
    {
      id: "ai-2",
      section: "keyIdeas",
      note: "Compounding interest works in reverse for debt.",
      generatedAt: new Date().toISOString(),
    },
    {
      id: "ai-3",
      section: "frameworks",
      note: "Distribution beats product quality for most early-stage startups.",
      generatedAt: new Date().toISOString(),
    },
  ];
  const merged = mergeListenAiNotes(existing, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged[1]!.id, "ai-3");
});

test("buildListenLiveNotes latestInsight uses newest AI note", () => {
  const aiNotes: ListenAiNote[] = [
    {
      id: "ai-old",
      section: "keyIdeas",
      note: "First insight from the session.",
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "ai-new",
      section: "concepts",
      note: "Latest insight from the session.",
      generatedAt: "2026-01-01T00:01:00.000Z",
    },
  ];
  const notes = buildListenLiveNotes({ moments: [], aiNotes });
  assert.equal(notes.latestInsight?.id, "ai-new");
  assert.match(notes.latestInsight?.note ?? "", /Latest insight/);
});
