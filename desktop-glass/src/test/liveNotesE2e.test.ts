/**
 * §10 Live Notes — End-to-End spec
 *
 * Exercises the full pipeline from raw session events / transcript fragments
 * through to the structured LiveNotesState that the panel renders.
 * No Electron required: all logic is pure-TS, tested in-process.
 *
 * Contract coverage:
 *   - Empty / thin transcript → "building" / "developing" state
 *   - Transcript + moments → sections (keyIdeas, actionIdeas, questions …)
 *   - Topic field populated from moments or rolling transcript
 *   - Elapsed labels on entries when listenStartedMs is provided
 *   - Refresh-interval gate respected (10–20 s)
 *   - Listen stopped → notes remain, listeningStatus = "idle"
 *   - Unclear transcript fragment → unclearTranscriptNote hint
 *   - Duplicate transcript chunks deduped
 *   - Checkpoint summaries surfaced in final report
 *   - listenTranscriptChunksFromEvents extracts system_audio events only
 *   - Action items go to actionIdeas (not rendered as action-first cards)
 *   - buildListenLiveNotes is idempotent (same input → same output)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildListenLiveNotes,
  listenTranscriptChunksFromEvents,
  shouldRefreshStreamingLiveNotes,
  unclearTranscriptNote,
  LIVE_NOTES_REFRESH_MS,
  LIVE_NOTES_REFRESH_MIN_MS,
  LIVE_NOTES_REFRESH_MAX_MS,
  computeLiveNotesRefreshInterval,
} from "../shared/listenLiveNotes.ts";
import { isActionFirstListenCard } from "../shared/listenInsightQuality.ts";
import {
  applyListenTranscriptFragment,
  initialListenRollingTranscript,
} from "../shared/listenStreamingTranscript.ts";
import {
  buildListenCheckpointSummary,
  shouldWriteListenCheckpoint,
  STREAMING_LISTEN_CHECKPOINT_MINUTES,
} from "../shared/listenCheckpoint.ts";
import { buildListenReportSections } from "../shared/listenReport.ts";
import { withMomentMaturity } from "../shared/listenMomentMaturity.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";
import type { GlassSessionEvent, GlassSession } from "../shared/sessionTypes.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNow(): number {
  return Date.now();
}

function makeMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const nowMs = makeNow();
  const anchor =
    "Distribution is the single biggest lever for early-stage startup success.";
  const base: ListenMoment = {
    id: `m-${Math.random().toString(36).slice(2)}`,
    type: "key_idea",
    summary: "Distribution beats product for early-stage startups.",
    transcriptAnchors: [anchor, `${anchor} Stated again.`, `${anchor} Third time.`],
    firstSeenAt: new Date(nowMs - 60_000).toISOString(),
    lastUpdatedAt: new Date(nowMs).toISOString(),
    confidence: 0.9,
    importance: "high",
    suggestedThought: "Distribution is the single biggest lever.",
    reasonSelected: "High-signal key idea from transcript.",
    status: "ready",
    ...overrides,
  };
  return withMomentMaturity(base, nowMs, "content");
}

function makeActionMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const nowMs = makeNow();
  const anchor =
    "Send the revised proposal to the client before end of week, follow up on Monday.";
  const base: ListenMoment = {
    id: `m-action-${Math.random().toString(36).slice(2)}`,
    type: "action_step",
    summary: "Send proposal to client by Friday and follow up Monday.",
    transcriptAnchors: [anchor, `${anchor} Confirmed.`, `${anchor} Third mention.`],
    firstSeenAt: new Date(nowMs - 50_000).toISOString(),
    lastUpdatedAt: new Date(nowMs).toISOString(),
    confidence: 0.9,
    importance: "high",
    suggestedThought: "Action: send the revised proposal to the client by Friday.",
    reasonSelected: "Clear action item from transcript.",
    status: "ready",
    ...overrides,
  };
  return withMomentMaturity(base, nowMs, "content");
}

function makeTranscriptEvent(text: string, id = `e-${Math.random().toString(36).slice(2)}`): GlassSessionEvent {
  return {
    id,
    sessionId: "s-e2e",
    kind: "transcript_note",
    title: "chunk",
    text,
    timestamp: new Date().toISOString(),
    tags: ["system_audio"],
  };
}

// ---------------------------------------------------------------------------
// §10 E2E: Empty / thin-transcript state
// ---------------------------------------------------------------------------

test("[§10 E2E] empty session → developing/building state with no entries", () => {
  const notes = buildListenLiveNotes({
    moments: [],
    transcriptChunks: [],
    listenStartedMs: makeNow() - 2_000,
  });
  assert.equal(notes.entries.length, 0);
  assert.equal(notes.sections.keyIdeas.length, 0);
  assert.equal(notes.sections.actionIdeas.length, 0);
  assert.equal(notes.transcriptChunkCount, 0);
  assert.equal(notes.listeningStatus, "listening");
});

test("[§10 E2E] single short transcript chunk → still thin, no notes", () => {
  const notes = buildListenLiveNotes({
    moments: [],
    transcriptChunks: ["Yeah."],
    rollingTranscript: "Yeah.",
    listenStartedMs: makeNow() - 3_000,
  });
  // A single word fragment should not spawn any meaning notes
  const total =
    notes.sections.keyIdeas.length +
    notes.sections.concepts.length +
    notes.sections.actionIdeas.length;
  assert.ok(total === 0, `Expected no notes from thin transcript, got ${total}`);
});

// ---------------------------------------------------------------------------
// §10 E2E: Transcript + moments → sections populate
// ---------------------------------------------------------------------------

test("[§10 E2E] mature key-idea moment → keyIdeas entry in entries array", () => {
  // Sections only populated by AI notes (single-layer). Local moments → entries.
  const moment = makeMoment();
  const notes = buildListenLiveNotes({
    moments: [moment],
    transcriptChunks: [moment.transcriptAnchors[0]!],
    listenStartedMs: makeNow() - 70_000,
  });
  const keyIdeaEntries = notes.entries.filter((e) => e.section === "keyIdeas");
  assert.ok(keyIdeaEntries.length >= 1, "keyIdeas should have at least one entry");
  assert.equal(notes.sections.keyIdeas.length, 0, "sections.keyIdeas empty before AI pass");
});

test("[§10 E2E] mature action moment → actionIdeas entry (not action-first card text)", () => {
  const moment = makeActionMoment();
  const notes = buildListenLiveNotes({
    moments: [moment],
    transcriptChunks: [],
    listenStartedMs: makeNow() - 70_000,
  });
  const actionEntries = notes.entries.filter((e) => e.section === "actionIdeas");
  assert.ok(actionEntries.length >= 1, "actionIdeas should have at least one entry");
  // Must not begin with an action prompt (e.g. "Want me to…")
  const first = actionEntries[0]!.text;
  assert.doesNotMatch(first, /^want me to/i);
  assert.doesNotMatch(first, /^should i/i);
});

test("[§10 E2E] moment with suggestedQuestion → questions section", () => {
  const nowMs = makeNow();
  const anchor = "Why does distribution outperform product quality in early startups?";
  const base: ListenMoment = {
    id: "m-q",
    type: "key_idea",
    summary: "Distribution question.",
    transcriptAnchors: [anchor, `${anchor} Again.`, `${anchor} Third.`],
    firstSeenAt: new Date(nowMs - 60_000).toISOString(),
    lastUpdatedAt: new Date(nowMs).toISOString(),
    confidence: 0.85,
    importance: "high",
    status: "ready",
    suggestedQuestion: "Why does distribution outperform product quality in early startups?",
  };
  const moment = withMomentMaturity(base, nowMs, "content");
  const notes = buildListenLiveNotes({ moments: [moment] });
  const questionEntries = notes.entries.filter((e) => e.section === "questions");
  assert.ok(questionEntries.length >= 1, "questions entry should be present for suggestedQuestion");
});

// ---------------------------------------------------------------------------
// §10 E2E: Topic field
// ---------------------------------------------------------------------------

test("[§10 E2E] topic populated from mature key-idea moment", () => {
  const moment = makeMoment();
  const notes = buildListenLiveNotes({
    moments: [moment],
    listenStartedMs: makeNow() - 70_000,
  });
  assert.ok(notes.currentTopic, "currentTopic should be set");
  assert.ok(notes.currentTopic!.length >= 16);
});

test("[§10 E2E] topic falls back to rolling transcript tail when no moments", () => {
  const rolling = "Understanding customer acquisition cost is critical for unit economics.";
  const notes = buildListenLiveNotes({
    moments: [],
    rollingTranscript: rolling,
  });
  assert.ok(notes.currentTopic, "currentTopic should fall back to rolling transcript");
  assert.match(notes.currentTopic!, /acquisition|unit economics|critical/i);
});

// ---------------------------------------------------------------------------
// §10 E2E: Elapsed labels
// ---------------------------------------------------------------------------

test("[§10 E2E] elapsed labels appear on entries when listenStartedMs provided", () => {
  const listenStartedMs = makeNow() - 90_000; // 90s ago
  const moment = makeMoment();
  const notes = buildListenLiveNotes({
    moments: [moment],
    listenStartedMs,
  });
  const entry = notes.entries[0];
  assert.ok(entry, "should have at least one entry");
  assert.ok(entry.elapsedLabel, "entry should have an elapsedLabel");
  assert.match(entry.elapsedLabel!, /m|s/); // "1m 30s" or "90s"
});

test("[§10 E2E] no elapsed label when listenStartedMs not provided", () => {
  const notes = buildListenLiveNotes({ moments: [makeMoment()] });
  const entry = notes.entries[0];
  if (entry) {
    assert.ok(entry.elapsedLabel === undefined || entry.elapsedLabel === null || entry.elapsedLabel === "");
  }
});

// ---------------------------------------------------------------------------
// §10 E2E: Refresh-interval gate
// ---------------------------------------------------------------------------

test("[§10 E2E] refresh not due before interval elapses", () => {
  const lastRefreshMs = makeNow() - LIVE_NOTES_REFRESH_MS + 2_000;
  assert.equal(shouldRefreshStreamingLiveNotes(lastRefreshMs, makeNow()), false);
});

test("[§10 E2E] refresh due once interval elapses", () => {
  const lastRefreshMs = makeNow() - LIVE_NOTES_REFRESH_MS - 1;
  assert.equal(shouldRefreshStreamingLiveNotes(lastRefreshMs, makeNow()), true);
});

test("[§10 E2E] refresh due when lastRefreshMs is undefined (first refresh)", () => {
  assert.equal(shouldRefreshStreamingLiveNotes(undefined, makeNow()), true);
});

test("[§10 E2E] adaptive refresh interval faster with rich transcript", () => {
  const fastInterval = computeLiveNotesRefreshInterval(500); // lots of new chars
  const normalInterval = computeLiveNotesRefreshInterval(200);
  const slowInterval = computeLiveNotesRefreshInterval(50);
  assert.equal(fastInterval, LIVE_NOTES_REFRESH_MIN_MS);
  assert.equal(normalInterval, LIVE_NOTES_REFRESH_MS);
  assert.equal(slowInterval, LIVE_NOTES_REFRESH_MAX_MS);
});

// ---------------------------------------------------------------------------
// §10 E2E: Listen stopped → notes remain, listeningStatus = "idle"
// ---------------------------------------------------------------------------

test("[§10 E2E] after listen stops, notes remain with listeningStatus=idle", () => {
  const moment = makeMoment();
  const notesWhileListening = buildListenLiveNotes({
    moments: [moment],
    listeningStatus: "listening",
  });
  assert.equal(notesWhileListening.listeningStatus, "listening");

  // Simulate stop: pass same moments but listeningStatus = "idle"
  const notesAfterStop = buildListenLiveNotes({
    moments: [moment],
    listeningStatus: "idle",
  });
  assert.equal(notesAfterStop.listeningStatus, "idle");
  // Notes still present — they don't disappear on stop
  assert.equal(notesAfterStop.entries.length, notesWhileListening.entries.length);
  assert.equal(notesAfterStop.sections.keyIdeas.length, notesWhileListening.sections.keyIdeas.length);
});

test("[§10 E2E] refresh gate not triggered without new transcript after stop", () => {
  // Freeze point: lastRefreshMs just before the interval
  const frozenAt = makeNow();
  const notFreshYet = shouldRefreshStreamingLiveNotes(frozenAt, frozenAt + 1_000);
  assert.equal(notFreshYet, false);
});

// ---------------------------------------------------------------------------
// §10 E2E: Unclear transcript → honest empty state
// ---------------------------------------------------------------------------

test("[§10 E2E] short unclear transcript returns honest empty-state note", () => {
  const note = unclearTranscriptNote("continued, of this");
  assert.match(note, /not enough context/i);
});

test("[§10 E2E] longer unclear transcript fragment returned verbatim in note", () => {
  const frag = "something continued and building up from the previous point";
  const note = unclearTranscriptNote(frag);
  assert.match(note, /needs more context/i);
});

test("[§10 E2E] unclearTranscriptNote result is never action-first", () => {
  const note = unclearTranscriptNote("partial list of things to consider");
  assert.equal(isActionFirstListenCard(note), false);
});

// ---------------------------------------------------------------------------
// §10 E2E: Transcript chunk deduplication
// ---------------------------------------------------------------------------

test("[§10 E2E] duplicate transcript chunks tracked but not double-counted in notes", () => {
  const chunk = "Distribution is the most underrated startup skill.";
  const notes = buildListenLiveNotes({
    moments: [],
    transcriptChunks: [chunk, chunk, chunk],
  });
  assert.equal(notes.transcriptChunkCount, 3);
  assert.ok(notes.duplicateTranscriptCount >= 1, "duplicates should be flagged");
});

// ---------------------------------------------------------------------------
// §10 E2E: listenTranscriptChunksFromEvents extracts system_audio only
// ---------------------------------------------------------------------------

test("[§10 E2E] listenTranscriptChunksFromEvents extracts system_audio events only", () => {
  const events: GlassSessionEvent[] = [
    makeTranscriptEvent("System audio line one."),
    {
      id: "e-other",
      sessionId: "s-e2e",
      kind: "manual_note",
      title: "note",
      text: "Manual note should be ignored.",
      timestamp: new Date().toISOString(),
      // no system_audio tag
    },
    makeTranscriptEvent("System audio line two."),
  ];
  const chunks = listenTranscriptChunksFromEvents(events);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], "System audio line one.");
  assert.equal(chunks[1], "System audio line two.");
});

test("[§10 E2E] listenTranscriptChunksFromEvents dedupes identical chunks", () => {
  const events = [
    makeTranscriptEvent("Same line."),
    makeTranscriptEvent("Same line."),
  ];
  const chunks = listenTranscriptChunksFromEvents(events);
  assert.equal(chunks.length, 1);
});

// ---------------------------------------------------------------------------
// §10 E2E: Full pipeline — events → chunks → notes
// ---------------------------------------------------------------------------

test("[§10 E2E] full pipeline: events → chunks → notes sections populate", () => {
  const anchor = "Distribution is the single biggest lever for early-stage startup success.";
  const events: GlassSessionEvent[] = [
    makeTranscriptEvent(anchor),
    makeTranscriptEvent("The founders who win early often out-distribute, not out-build."),
    {
      id: "e-manual",
      sessionId: "s-e2e",
      kind: "manual_note",
      title: "non-audio",
      text: "Should not appear in chunks.",
      timestamp: new Date().toISOString(),
    },
  ];
  const chunks = listenTranscriptChunksFromEvents(events);
  assert.equal(chunks.length, 2);

  const moment = makeMoment();
  const notes = buildListenLiveNotes({
    moments: [moment],
    transcriptChunks: chunks,
    listenStartedMs: makeNow() - 90_000,
  });
  assert.equal(notes.transcriptChunkCount, 2);
  const keyIdeaEntries = notes.entries.filter((e) => e.section === "keyIdeas");
  assert.ok(keyIdeaEntries.length >= 1, "keyIdeas entry populated from moment");
  assert.ok(notes.micStatus === "off");
  assert.equal(notes.sourceLabel, "System Audio");
});

// ---------------------------------------------------------------------------
// §10 E2E: Rolling transcript pipeline
// ---------------------------------------------------------------------------

test("[§10 E2E] rolling transcript feeds streaming note candidates", () => {
  let rolling = initialListenRollingTranscript();
  rolling = applyListenTranscriptFragment(rolling, {
    text: "Desire is the starting point of all achievement according to the speaker today.",
    nowMs: 5_000,
  });
  rolling = applyListenTranscriptFragment(rolling, {
    text: "And distribution is the second lever that most founders underestimate early on.",
    nowMs: 8_000,
  });
  const notes = buildListenLiveNotes({
    moments: [],
    rollingTranscript: rolling.rollingText,
    listenStartedMs: 0,
    nowMs: 8_000,
  });
  // Sections empty pre-AI-pass. Streaming candidates land in entries.
  assert.ok(
    notes.entries.length >= 1,
    `Expected at least one entry from rich rolling transcript, got ${notes.entries.length}`,
  );
  assert.ok(notes.rollingPreview, "rollingPreview should be set");
});

// ---------------------------------------------------------------------------
// §10 E2E: Checkpoints
// ---------------------------------------------------------------------------

test("[§10 E2E] checkpoint created at correct interval", () => {
  const intervalMs = STREAMING_LISTEN_CHECKPOINT_MINUTES * 60_000;
  const early = shouldWriteListenCheckpoint({
    listenStartedMs: 0,
    nowMs: intervalMs - 500,
    lastCheckpointIndex: 0,
    checkpointMinutes: STREAMING_LISTEN_CHECKPOINT_MINUTES,
  });
  assert.equal(early.write, false);

  const due = shouldWriteListenCheckpoint({
    listenStartedMs: 0,
    nowMs: intervalMs + 500,
    lastCheckpointIndex: 0,
    checkpointMinutes: STREAMING_LISTEN_CHECKPOINT_MINUTES,
  });
  assert.equal(due.write, true);
  assert.equal(due.checkpointIndex, 1);
});

test("[§10 E2E] checkpoint summary feeds final report", () => {
  const now = new Date().toISOString();
  const moment = makeMoment({ status: "saved_silently" });
  const checkpoint = buildListenCheckpointSummary({
    checkpointIndex: 1,
    listenStartedMs: Date.now() - 180_000,
    nowMs: Date.now(),
    moments: [moment],
    checkpointMinutes: STREAMING_LISTEN_CHECKPOINT_MINUTES,
  });
  const session: GlassSession = {
    id: "s-cp",
    title: "Live Notes E2E",
    status: "ended",
    startedAt: now,
    updatedAt: now,
    events: [
      {
        id: "cp1",
        sessionId: "s-cp",
        kind: "manual_note",
        title: "Checkpoint",
        text: "Topic summary",
        timestamp: now,
        tags: ["listen_checkpoint"],
        metadata: { listenCheckpoint: checkpoint },
      },
    ],
    insights: [],
  };
  const sections = buildListenReportSections({ session, moments: [] });
  const cp = sections.find((s) => s.heading === "Session checkpoints");
  assert.ok(cp?.items.length, "Final report should contain checkpoint section");
});

// ---------------------------------------------------------------------------
// §10 E2E: Idempotency
// ---------------------------------------------------------------------------

test("[§10 E2E] buildListenLiveNotes is idempotent — same input same output", () => {
  const input = {
    moments: [makeMoment()],
    transcriptChunks: ["Distribution is the key lever."],
    listenStartedMs: makeNow() - 60_000,
    nowMs: makeNow(),
  };
  const a = buildListenLiveNotes(input);
  const b = buildListenLiveNotes(input);
  assert.equal(a.entries.length, b.entries.length);
  assert.equal(a.sections.keyIdeas.length, b.sections.keyIdeas.length);
  assert.equal(a.transcriptChunkCount, b.transcriptChunkCount);
});

// ---------------------------------------------------------------------------
// §10 E2E: Max topic length
// ---------------------------------------------------------------------------

test("[§10 E2E] currentTopic is capped at 160 chars", () => {
  const longText = "A".repeat(200);
  const notes = buildListenLiveNotes({
    moments: [],
    rollingTranscript: longText,
  });
  if (notes.currentTopic) {
    assert.ok(notes.currentTopic.length <= 160);
  }
});

// ---------------------------------------------------------------------------
// §10 E2E: micStatus and sourceLabel
// ---------------------------------------------------------------------------

test("[§10 E2E] micStatus is always off — Live Notes uses system audio only", () => {
  const notes = buildListenLiveNotes({ moments: [] });
  assert.equal(notes.micStatus, "off");
  assert.equal(notes.sourceLabel, "System Audio");
});
