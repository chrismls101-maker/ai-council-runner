import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyListenTranscriptFragment,
  initialListenRollingTranscript,
  rollingTranscriptWindow,
} from "../shared/listenStreamingTranscript.ts";
import {
  buildListenLiveNotes,
  extractStreamingNoteCandidates,
  shouldRefreshStreamingLiveNotes,
  LIVE_NOTES_REFRESH_MS,
} from "../shared/listenLiveNotes.ts";
import {
  buildListenCheckpointSummary,
  shouldWriteListenCheckpoint,
  STREAMING_LISTEN_CHECKPOINT_MINUTES,
} from "../shared/listenCheckpoint.ts";
import { buildListenReportSections } from "../shared/listenReport.ts";
import type { GlassSession } from "../shared/sessionTypes.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";

test("interim fragment updates in place then final replaces interim", () => {
  let state = initialListenRollingTranscript();
  state = applyListenTranscriptFragment(state, { text: "Desire is the", isInterim: true, nowMs: 1000 });
  assert.equal(state.fragments.length, 1);
  assert.equal(state.fragments[0]!.isInterim, true);

  state = applyListenTranscriptFragment(state, {
    text: "Desire is the starting point of achievement.",
    isInterim: false,
    nowMs: 2000,
  });
  assert.equal(state.fragments.length, 1);
  assert.equal(state.fragments[0]!.isInterim, false);
  assert.match(state.rollingText, /starting point/i);
});

test("related final chunks merge via extension instead of duplicating", () => {
  let state = initialListenRollingTranscript();
  state = applyListenTranscriptFragment(state, {
    text: "Distribution matters for founders.",
    nowMs: 1000,
  });
  state = applyListenTranscriptFragment(state, {
    text: "Distribution matters for founders building in public.",
    nowMs: 2000,
  });
  assert.equal(state.fragments.length, 1);
  assert.match(state.rollingText, /building in public/i);
});

test("duplicate fragment increments duplicate count without spam", () => {
  let state = initialListenRollingTranscript();
  state = applyListenTranscriptFragment(state, { text: "Same line again.", nowMs: 1000 });
  state = applyListenTranscriptFragment(state, { text: "Same line again.", nowMs: 2000 });
  assert.ok(state.duplicateFragmentCount >= 1);
});

test("shouldRefreshStreamingLiveNotes every ~15 seconds", () => {
  assert.equal(shouldRefreshStreamingLiveNotes(undefined, 1000), true);
  assert.equal(shouldRefreshStreamingLiveNotes(1000, 1000 + LIVE_NOTES_REFRESH_MS - 1), false);
  assert.equal(shouldRefreshStreamingLiveNotes(1000, 1000 + LIVE_NOTES_REFRESH_MS), true);
});

test("live notes update from rolling transcript fragments", () => {
  let rolling = initialListenRollingTranscript();
  rolling = applyListenTranscriptFragment(rolling, {
    text: "Desire is the starting point of all achievement according to the speaker today.",
    nowMs: 5000,
  });
  const candidates = extractStreamingNoteCandidates(rolling.rollingText, [], 0, 5000);
  assert.ok(candidates.length >= 1);

  const notes = buildListenLiveNotes({
    moments: [],
    rollingTranscript: rolling.rollingText,
    listenStartedMs: 0,
    nowMs: 5000,
  });
  const total =
    notes.sections.keyIdeas.length +
    notes.sections.concepts.length +
    notes.sections.quotes.length;
  assert.ok(total >= 1);
  assert.ok(notes.rollingPreview);
});

test("incomplete fragment becomes developing note not action item", () => {
  const entries = extractStreamingNoteCandidates(
    "of two sealed envelopes continued",
    [],
    0,
    1000,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.status, "developing");
  assert.notEqual(entries[0]!.section, "actionIdeas");
});

test("related chunks merge into one note via dedupe", () => {
  const first = extractStreamingNoteCandidates(
    "Distribution matters for early founders. Distribution matters for early founders building in public.",
    [],
    0,
    1000,
  );
  assert.ok(first.length <= 2);
});

test("checkpoints created periodically at streaming interval", () => {
  const start = 0;
  const intervalMs = STREAMING_LISTEN_CHECKPOINT_MINUTES * 60_000;
  const first = shouldWriteListenCheckpoint({
    listenStartedMs: start,
    nowMs: intervalMs - 1000,
    lastCheckpointIndex: 0,
    checkpointMinutes: STREAMING_LISTEN_CHECKPOINT_MINUTES,
  });
  assert.equal(first.write, false);

  const second = shouldWriteListenCheckpoint({
    listenStartedMs: start,
    nowMs: intervalMs + 1000,
    lastCheckpointIndex: 0,
    checkpointMinutes: STREAMING_LISTEN_CHECKPOINT_MINUTES,
  });
  assert.equal(second.write, true);
  assert.equal(second.checkpointIndex, 1);
});

test("final report uses checkpoint summaries", () => {
  const now = new Date().toISOString();
  const session: GlassSession = {
    id: "s1",
    title: "Listen",
    status: "ended",
    startedAt: now,
    updatedAt: now,
    events: [
      {
        id: "cp1",
        sessionId: "s1",
        kind: "manual_note",
        title: "Checkpoint",
        text: "Topic",
        timestamp: now,
        tags: ["listen_checkpoint"],
        metadata: {
          listenCheckpoint: buildListenCheckpointSummary({
            checkpointIndex: 1,
            listenStartedMs: Date.now() - 180_000,
            nowMs: Date.now(),
            moments: [
              {
                id: "m1",
                type: "key_idea",
                summary: "Distribution beats speed.",
                transcriptAnchors: ["Distribution beats speed for founders."],
                firstSeenAt: now,
                lastUpdatedAt: now,
                confidence: 0.9,
                importance: "high",
                suggestedThought: "Distribution may matter more than speed.",
                status: "saved_silently",
              } satisfies ListenMoment,
            ],
            checkpointMinutes: STREAMING_LISTEN_CHECKPOINT_MINUTES,
          }),
        },
      },
    ],
    insights: [],
  };
  const sections = buildListenReportSections({ session, moments: [] });
  const cp = sections.find((s) => s.heading === "Session checkpoints");
  assert.ok(cp?.items.length);
  assert.match(sections.find((s) => s.heading === "What this was about")!.items[0]!, /Distribution/i);
});

test("raw transcript separate from live notes sections", () => {
  let rolling = initialListenRollingTranscript();
  rolling = applyListenTranscriptFragment(rolling, {
    text: "Raw fragment line one from system audio.",
    nowMs: 1000,
  });
  const notes = buildListenLiveNotes({
    moments: [],
    transcriptChunks: ["Raw fragment line one from system audio."],
    rollingTranscript: rolling.rollingText,
  });
  assert.equal(notes.transcriptChunkCount, 1);
  assert.notEqual(notes.rollingPreview, notes.sections.keyIdeas[0]);
});

test("Listen Mode live notes keep microphone off in state", () => {
  const notes = buildListenLiveNotes({ moments: [], rollingTranscript: "Sample." });
  assert.equal(notes.micStatus, "off");
  assert.equal(notes.sourceLabel, "System Audio");
});

test("rollingTranscriptWindow caps recent context", () => {
  let state = initialListenRollingTranscript();
  const long = "word ".repeat(500).trim();
  state = applyListenTranscriptFragment(state, { text: long, nowMs: 1000 });
  const window = rollingTranscriptWindow(state, 200);
  assert.ok(window.length <= 200);
});
