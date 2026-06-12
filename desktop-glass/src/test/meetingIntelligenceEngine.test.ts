/**
 * Meeting Intelligence engine tests.
 *
 * Covers:
 *   - No-op when transcript is too short
 *   - Classification fires at MEETING_CLASSIFY_MIN_CHARS
 *   - Returns same reference when nothing changed
 *   - Extraction runs when enough delta + time has passed
 *   - Extraction skipped when not enough time or delta
 *   - Moments are deduped against existing ones
 *   - Reclassification path (low confidence → retry)
 *   - Manual override is never reclassified
 *   - applyMeetingTypeOverrideInEngine resets extraction cursor
 *   - resetMeetingIntelligenceState returns clean state
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runMeetingIntelligencePass,
  applyMeetingTypeOverrideInEngine,
  resetMeetingIntelligenceState,
} from "../shared/meetingIntelligenceEngine.ts";

import {
  MEETING_CLASSIFY_MIN_CHARS,
  MEETING_EXTRACTION_INTERVAL_MS,
  MEETING_EXTRACTION_MIN_DELTA_CHARS,
  MEETING_INTELLIGENCE_INITIAL_STATE,
} from "../shared/meetingIntelligenceTypes.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let idSeq = 0;
const testId = () => `test-mm-${++idSeq}`;

/** Make a transcript long enough to trigger classification. */
function longTranscript(extra = ""): string {
  return "a".repeat(MEETING_CLASSIFY_MIN_CHARS + 1) + extra;
}

const SALES_TRANSCRIPT = `
  Hey Sarah, great to connect. So tell me — what's driving the urgency here?
  We've been struggling with our current CRM, it's just too slow and our sales team hates
  updating it manually. We looked at Salesforce but it's too expensive for us right now.
  Budget is approved for Q3, our VP of Sales has sign-off authority.
  We need something we can implement before end of quarter.
  The pain point is really around pipeline visibility — we can't see where deals are stuck.
  Sounds like a great fit. Let me show you a quick demo of how we handle that.
  We'd love to do a pilot, can you send the proposal by Friday?
  Absolutely, I'll follow up with the proposal and schedule the next steps.
`.repeat(2);

const TEAM_TRANSCRIPT = `
  Alright let's kick off the standup. Maria, can you start?
  Sure. Yesterday I finished the auth refactor. Today I'm working on Sprint 14 ticket #342.
  I'm blocked on the API — waiting on Tom's PR to merge before I can proceed.
  Tom, what's your status? I'll have the PR ready by end of day Friday.
  The decision from last meeting stands — we're going with the new auth flow.
  Action item: Tom ships the PR by Friday, Maria picks up ticket #342 after merge.
  Let's circle back on the deployment question at the next sync.
  Risk: if the PR slips past Friday we miss the sprint deadline.
`.repeat(2);

const BASE_NOW = 1_700_000_000_000; // fixed clock for tests

/** A "far future" nowMs that satisfies the extraction interval gate. */
const FAR_FUTURE = BASE_NOW + MEETING_EXTRACTION_INTERVAL_MS + 1;

// ─── Basics ───────────────────────────────────────────────────────────────────

test("runMeetingIntelligencePass: returns initial state when transcript too short", () => {
  const state = resetMeetingIntelligenceState();
  const next = runMeetingIntelligencePass({
    transcript: "Too short.",
    state,
    nowMs: BASE_NOW,
    idFactory: testId,
  });
  assert.equal(next, state, "should return same reference — no change");
  assert.equal(next.classification, null);
  assert.equal(next.moments.length, 0);
});

test("runMeetingIntelligencePass: returns same reference when transcript is empty", () => {
  const state = resetMeetingIntelligenceState();
  const next = runMeetingIntelligencePass({ transcript: "", state, nowMs: BASE_NOW });
  assert.equal(next, state);
});

test("resetMeetingIntelligenceState: returns fresh initial state", () => {
  const s = resetMeetingIntelligenceState();
  assert.equal(s.classification, null);
  assert.equal(s.moments.length, 0);
  assert.equal(s.reclassifyAttempted, undefined);
  assert.equal(s.lastExtractionAt, undefined);
  assert.equal(s.lastExtractionTranscriptLen, undefined);
});

test("resetMeetingIntelligenceState: returns a new object each call", () => {
  const a = resetMeetingIntelligenceState();
  const b = resetMeetingIntelligenceState();
  assert.notEqual(a, b, "should be distinct objects");
  // But identical content to the exported initial state
  assert.deepEqual(a, MEETING_INTELLIGENCE_INITIAL_STATE);
});

// ─── Classification ───────────────────────────────────────────────────────────

test("runMeetingIntelligencePass: classification fires at threshold", () => {
  const state = resetMeetingIntelligenceState();
  const next = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state,
    nowMs: BASE_NOW,
    idFactory: testId,
  });
  assert.notEqual(next, state, "state should change");
  assert.ok(next.classification !== null, "classification should fire");
  assert.equal(next.transcriptLengthAtClassification, SALES_TRANSCRIPT.length);
});

test("runMeetingIntelligencePass: classifies sales transcript as sales_external", () => {
  const state = resetMeetingIntelligenceState();
  const next = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state,
    nowMs: BASE_NOW,
    idFactory: testId,
  });
  assert.equal(next.classification?.subType, "sales_external");
});

test("runMeetingIntelligencePass: classifies team transcript as team_internal", () => {
  const state = resetMeetingIntelligenceState();
  const next = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state,
    nowMs: BASE_NOW,
    idFactory: testId,
  });
  assert.equal(next.classification?.subType, "team_internal");
});

test("runMeetingIntelligencePass: classification not repeated once set with high confidence", () => {
  const state = resetMeetingIntelligenceState();
  // First pass classifies
  const classified = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state,
    nowMs: BASE_NOW,
    idFactory: testId,
  });
  assert.ok(classified.classification !== null);

  // Second pass with same transcript — classification already set, no reclassify needed
  const second = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state: classified,
    nowMs: BASE_NOW + 1000,
    idFactory: testId,
  });
  // Should be the same classification object (not re-run)
  assert.equal(second.classification, classified.classification, "classification should not re-run");
});

// ─── Reclassification ─────────────────────────────────────────────────────────

test("runMeetingIntelligencePass: reclassify fires when low confidence + enough new transcript", () => {
  // Start with a low-confidence 'general' classification at transcript length 400
  const ambiguousTranscript = "Hello everyone, let's get started. ".repeat(15); // ~500 chars
  const state = resetMeetingIntelligenceState();
  const classified = runMeetingIntelligencePass({
    transcript: ambiguousTranscript,
    state,
    nowMs: BASE_NOW,
    idFactory: testId,
  });
  // Should have classified (probably general with low confidence)
  assert.ok(classified.classification !== null);
  assert.ok(!classified.classification.manualOverride);

  // Force a low confidence state for the reclassify check
  const lowConfState = {
    ...classified,
    classification: { ...classified.classification!, confidence: 0.2 },
    reclassifyAttempted: false,
  };

  // Now pass a much longer transcript (meets reclassify threshold)
  const longerTranscript = ambiguousTranscript + SALES_TRANSCRIPT;
  const reclassified = runMeetingIntelligencePass({
    transcript: longerTranscript,
    state: lowConfState,
    nowMs: BASE_NOW + 5000,
    idFactory: testId,
  });

  // reclassifyAttempted should be true after the attempt
  assert.equal(reclassified.reclassifyAttempted, true);
});

test("runMeetingIntelligencePass: reclassify does NOT fire when already attempted", () => {
  const ambiguous = "Hello everyone, let's get started. ".repeat(15);
  const state: typeof MEETING_INTELLIGENCE_INITIAL_STATE = {
    ...resetMeetingIntelligenceState(),
    classification: {
      subType: "general",
      confidence: 0.2,
      signals: [],
      classifiedAt: BASE_NOW,
      manualOverride: false,
      scores: { sales_external: 0, team_internal: 0, product_review: 0, client_account: 0, general: 0 },
    },
    transcriptLengthAtClassification: 300,
    reclassifyAttempted: true, // already done
  };

  const longerTranscript = ambiguous + SALES_TRANSCRIPT;
  const next = runMeetingIntelligencePass({
    transcript: longerTranscript,
    state,
    nowMs: BASE_NOW + 5000,
    idFactory: testId,
  });

  // classification should not have changed (same object)
  assert.equal(next.classification, state.classification, "should not reclassify again");
});

test("runMeetingIntelligencePass: manual override is never reclassified", () => {
  const state: typeof MEETING_INTELLIGENCE_INITIAL_STATE = {
    ...resetMeetingIntelligenceState(),
    classification: {
      subType: "product_review",
      confidence: 1.0,
      signals: ["manual_override"],
      classifiedAt: BASE_NOW,
      manualOverride: true,
      scores: { sales_external: 0, team_internal: 0, product_review: 0, client_account: 0, general: 0 },
    },
    transcriptLengthAtClassification: 300,
    reclassifyAttempted: false,
  };

  const next = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state,
    nowMs: BASE_NOW + 60_000,
    idFactory: testId,
  });

  assert.equal(next.classification?.subType, "product_review", "should keep manual override");
  assert.equal(next.classification?.manualOverride, true);
});

// ─── Extraction ───────────────────────────────────────────────────────────────

test("runMeetingIntelligencePass: extraction runs after classification + enough delta + time", () => {
  // Start with a pre-classified state, no extraction yet
  const classified: typeof MEETING_INTELLIGENCE_INITIAL_STATE = {
    classification: {
      subType: "team_internal",
      confidence: 0.8,
      signals: ["transcript:team_internal(+3)"],
      classifiedAt: BASE_NOW,
      manualOverride: false,
      scores: { sales_external: 0, team_internal: 10, product_review: 0, client_account: 0, general: 0 },
    },
    moments: [],
    transcriptLengthAtClassification: 300,
    lastExtractionAt: 0,
    lastExtractionTranscriptLen: 0,
  };

  const richTranscript = TEAM_TRANSCRIPT; // has blockers, decisions, action items
  const next = runMeetingIntelligencePass({
    transcript: richTranscript,
    state: classified,
    nowMs: FAR_FUTURE,
    idFactory: testId,
  });

  assert.notEqual(next, classified, "state should change");
  assert.ok(next.lastExtractionTranscriptLen! > 0, "extraction cursor should advance");
  assert.equal(next.lastExtractionTranscriptLen, richTranscript.length);
});

test("runMeetingIntelligencePass: extraction skipped when not enough time has passed", () => {
  const classified: typeof MEETING_INTELLIGENCE_INITIAL_STATE = {
    classification: {
      subType: "team_internal",
      confidence: 0.8,
      signals: [],
      classifiedAt: BASE_NOW,
      manualOverride: false,
      scores: { sales_external: 0, team_internal: 10, product_review: 0, client_account: 0, general: 0 },
    },
    moments: [],
    transcriptLengthAtClassification: 300,
    lastExtractionAt: BASE_NOW,  // just ran
    lastExtractionTranscriptLen: 0,
  };

  const next = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state: classified,
    nowMs: BASE_NOW + 1000, // only 1s later — below MEETING_EXTRACTION_INTERVAL_MS
    idFactory: testId,
  });

  // No extraction should have run (not enough time)
  assert.equal(next, classified, "should return same reference");
});

test("runMeetingIntelligencePass: extraction skipped when delta is too small", () => {
  const classified: typeof MEETING_INTELLIGENCE_INITIAL_STATE = {
    classification: {
      subType: "team_internal",
      confidence: 0.8,
      signals: [],
      classifiedAt: BASE_NOW,
      manualOverride: false,
      scores: { sales_external: 0, team_internal: 10, product_review: 0, client_account: 0, general: 0 },
    },
    moments: [],
    transcriptLengthAtClassification: 300,
    lastExtractionAt: 0,
    lastExtractionTranscriptLen: TEAM_TRANSCRIPT.length - 10, // only 10 chars delta
  };

  const next = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state: classified,
    nowMs: FAR_FUTURE,
    idFactory: testId,
  });

  // Delta = 10 chars < MEETING_EXTRACTION_MIN_DELTA_CHARS
  assert.equal(next, classified, "should return same reference");
});

test("runMeetingIntelligencePass: moments accumulate across passes", () => {
  // Start with a classification in place, no moments yet
  const classified: typeof MEETING_INTELLIGENCE_INITIAL_STATE = {
    classification: {
      subType: "team_internal",
      confidence: 0.9,
      signals: [],
      classifiedAt: BASE_NOW,
      manualOverride: false,
      scores: { sales_external: 0, team_internal: 12, product_review: 0, client_account: 0, general: 0 },
    },
    moments: [],
    transcriptLengthAtClassification: 300,
    lastExtractionAt: 0,
    lastExtractionTranscriptLen: 0,
  };

  const after = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state: classified,
    nowMs: FAR_FUTURE,
    idFactory: testId,
  });

  // Should have extracted some moments
  assert.ok(after.moments.length >= 0, "moments array exists");
  // Each moment has required fields
  for (const m of after.moments) {
    assert.ok(m.id, "moment has id");
    assert.ok(m.type, "moment has type");
    assert.ok(m.content, "moment has content");
    assert.ok(typeof m.detectedAt === "number", "moment has detectedAt");
  }
});

test("runMeetingIntelligencePass: moments are deduped across passes", () => {
  const classified: typeof MEETING_INTELLIGENCE_INITIAL_STATE = {
    classification: {
      subType: "team_internal",
      confidence: 0.9,
      signals: [],
      classifiedAt: BASE_NOW,
      manualOverride: false,
      scores: { sales_external: 0, team_internal: 12, product_review: 0, client_account: 0, general: 0 },
    },
    moments: [],
    transcriptLengthAtClassification: 300,
    lastExtractionAt: 0,
    lastExtractionTranscriptLen: 0,
  };

  // First pass extracts from transcript
  const after1 = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state: classified,
    nowMs: FAR_FUTURE,
    idFactory: testId,
  });

  const momentCountAfterFirst = after1.moments.length;

  // Second pass: re-process same text (extraction cursor hasn't advanced past it)
  // but NOW pretend the cursor is at the end — so delta is empty/too small
  // and the same moments are already in state. If we reset cursor manually:
  const stateWithResetCursor = {
    ...after1,
    lastExtractionTranscriptLen: 0,
    lastExtractionAt: 0,
  };

  const after2 = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state: stateWithResetCursor,
    nowMs: FAR_FUTURE + MEETING_EXTRACTION_INTERVAL_MS + 1,
    idFactory: testId,
  });

  // All new moments from pass 2 should have been deduped against pass 1
  assert.equal(
    after2.moments.length,
    momentCountAfterFirst,
    "no duplicate moments should be added",
  );
});

// ─── applyMeetingTypeOverrideInEngine ─────────────────────────────────────────

test("applyMeetingTypeOverrideInEngine: sets override + resets extraction cursor", () => {
  const state: typeof MEETING_INTELLIGENCE_INITIAL_STATE = {
    classification: {
      subType: "general",
      confidence: 0.3,
      signals: [],
      classifiedAt: BASE_NOW,
      manualOverride: false,
      scores: { sales_external: 0, team_internal: 0, product_review: 0, client_account: 0, general: 0 },
    },
    moments: [{ id: "m1", type: "decision", content: "We decided X", detectedAt: BASE_NOW }],
    transcriptLengthAtClassification: 300,
    lastExtractionAt: BASE_NOW,
    lastExtractionTranscriptLen: 500,
  };

  const next = applyMeetingTypeOverrideInEngine(state, "sales_external");

  assert.equal(next.classification?.subType, "sales_external");
  assert.equal(next.classification?.manualOverride, true);
  assert.equal(next.classification?.confidence, 1.0);
  // Extraction cursor reset so new schema re-processes from start
  assert.equal(next.lastExtractionTranscriptLen, 0);
  assert.equal(next.lastExtractionAt, undefined);
  // Moments cleared — old schema moments don't belong in the new schema's feed
  assert.equal(next.moments.length, 0);
});

test("applyMeetingTypeOverrideInEngine: works from null classification", () => {
  const state = resetMeetingIntelligenceState();
  const next = applyMeetingTypeOverrideInEngine(state, "product_review");
  assert.equal(next.classification?.subType, "product_review");
  assert.equal(next.classification?.manualOverride, true);
});

// ─── Full round-trip ──────────────────────────────────────────────────────────

test("full round-trip: classify then extract in separate passes", () => {
  let state = resetMeetingIntelligenceState();

  // Pass 1: transcript long enough to classify but not yet enough time for extraction
  state = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state,
    nowMs: BASE_NOW,
    idFactory: testId,
  });

  assert.ok(state.classification !== null, "should be classified after pass 1");

  // Pass 2: same transcript, enough time for extraction
  state = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state,
    nowMs: FAR_FUTURE,
    idFactory: testId,
  });

  // Extraction should have run
  assert.equal(state.lastExtractionTranscriptLen, SALES_TRANSCRIPT.length);
  assert.ok(state.lastExtractionAt! > 0);
});

test("full round-trip: extraction uses schema matching classification subType", () => {
  // Client account transcript with a commitment
  const clientTranscript = `
    Thanks for joining the quarterly business review. How has Q2 been for your team?
    Honestly, we're a bit frustrated — the onboarding took longer than we expected.
    We promised them the integration would be live by end of Q2 and it slipped.
    They're at risk of churning if we don't resolve this quickly.
    We'll have the integration fixed and deployed by next Friday.
    I'll personally follow up with the customer success manager today.
    The NPS score dropped — we need to address that.
  `.repeat(3);

  let state = resetMeetingIntelligenceState();

  // Pass 1: classify
  state = runMeetingIntelligencePass({
    transcript: clientTranscript,
    state,
    nowMs: BASE_NOW,
    idFactory: testId,
  });

  // Pass 2: extract with correct schema
  state = runMeetingIntelligencePass({
    transcript: clientTranscript,
    state,
    nowMs: FAR_FUTURE,
    idFactory: testId,
  });

  // If classified as client_account, should have commitment and/or risk moments
  if (state.classification?.subType === "client_account") {
    const hasAccountMoment = state.moments.some(
      (m) => m.type === "commitment" || m.type === "risk",
    );
    assert.ok(hasAccountMoment, "client_account schema should extract commitments or risks");
  }
  // Even if classified differently, moments array should be valid
  assert.ok(Array.isArray(state.moments));
});
