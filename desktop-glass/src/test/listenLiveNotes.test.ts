import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildListenLiveNotes,
  listenTranscriptChunksFromEvents,
  unclearTranscriptNote,
} from "../shared/listenLiveNotes.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";
import { isActionFirstListenCard } from "../shared/listenInsightQuality.ts";
import { shouldSurfaceListenMoment } from "../shared/listenMomentTiming.ts";
import { withMomentMaturity } from "../shared/listenMomentMaturity.ts";
import { DEFAULT_LISTEN_WARMUP_MS } from "../shared/listenMomentTypes.ts";
import type { ListenSurfaceContext } from "../shared/listenMomentTypes.ts";

function readyMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const now = new Date().toISOString();
  return {
    id: "m1",
    type: "key_idea",
    summary: "Desire is the starting point of all achievement.",
    transcriptAnchors: ["Desire is the starting point of all achievement for practical success."],
    firstSeenAt: now,
    lastUpdatedAt: now,
    confidence: 0.85,
    importance: "high",
    suggestedThought:
      "The speaker frames success as beginning with a definite desire, not effort alone.",
    reasonSelected: "This stood out as a high-signal idea in the recent transcript.",
    status: "ready",
    ...overrides,
  };
}

function baseSurfaceContext(overrides: Partial<ListenSurfaceContext> = {}): ListenSurfaceContext {
  return {
    attentionLevel: "balanced",
    nowMs: Date.now(),
    recentTranscriptChars: 200,
    recentSurfacedTexts: [],
    userReceivingAnswer: false,
    muteSuggestions: false,
    surfacesInLast10Min: 0,
    liveThoughtsEnabled: true,
    ...overrides,
  };
}

test("Listen Mode balanced default does not surface action cards", () => {
  const moment = withMomentMaturity(readyMoment(), Date.now(), "content");
  const now = Date.now();
  const result = shouldSurfaceListenMoment(
    moment,
    baseSurfaceContext({
      attentionLevel: "balanced",
      nowMs: now,
      listenStartedMs: now - DEFAULT_LISTEN_WARMUP_MS - 5_000,
      listenWarmupMs: DEFAULT_LISTEN_WARMUP_MS,
    }),
  );
  assert.equal(result.decision, "save_silently");
  assert.match(result.reason, /Live Notes/i);
});

test("incomplete action fragment saved as note not card", () => {
  const moment = readyMoment({
    type: "action_step",
    summary: "of two sealed envelopes",
    transcriptAnchors: ["of two sealed envelopes"],
    suggestedThought: "Want me to turn it into an action plan?",
    confidence: 0.5,
    isStillDeveloping: true,
  });
  const result = shouldSurfaceListenMoment(moment, baseSurfaceContext({ attentionLevel: "active" }));
  assert.equal(result.decision, "save_silently");
});

test("buildListenLiveNotes creates structured notes from moments", () => {
  const notes = buildListenLiveNotes({
    moments: [readyMoment()],
    transcriptChunks: ["Desire is the starting point of all achievement."],
    listenStartedMs: Date.now() - 60_000,
  });
  assert.ok(notes.sections.keyIdeas.length >= 1);
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
  const moment = readyMoment({
    type: "action_step",
    summary: "Send the proposal to the client by Friday",
    transcriptAnchors: ["Send the proposal to the client by Friday before the standup."],
    suggestedThought: "Action: send the proposal to the client by Friday.",
    status: "ready",
  });
  const notes = buildListenLiveNotes({ moments: [moment] });
  assert.ok(notes.sections.actionIdeas.length >= 1);
  assert.equal(isActionFirstListenCard(notes.sections.actionIdeas[0] ?? ""), false);
});

test("raw transcript and notes are separate", () => {
  const events = [
    {
      id: "e1",
      sessionId: "s1",
      kind: "transcript" as const,
      title: "chunk",
      text: "Raw transcript line one.",
      timestamp: new Date().toISOString(),
      tags: ["system_audio"],
    },
  ];
  const chunks = listenTranscriptChunksFromEvents(events);
  const notes = buildListenLiveNotes({ moments: [readyMoment()], transcriptChunks: chunks });
  assert.equal(chunks[0], "Raw transcript line one.");
  assert.ok(notes.sections.keyIdeas[0]!.includes("definite desire"));
});

test("unclear transcript fragment note does not become action", () => {
  const note = unclearTranscriptNote("continued, is this list");
  assert.match(note, /not enough context/i);
  assert.equal(isActionFirstListenCard(note), false);
});
