/**
 * Meeting classifier + extraction schema tests.
 *
 * Covers:
 *   - classifyMeeting() with fixture transcripts for all 5 archetypes
 *   - Returns null below MEETING_CLASSIFY_MIN_CHARS
 *   - Falls through to "general" when scores are too close
 *   - applyMeetingTypeOverride()
 *   - shouldReclassify()
 *   - extractMomentsFromChunk() against schema patterns
 *   - Schema completeness (all 5 types have schemas + activeTypes)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyMeeting,
  applyMeetingTypeOverride,
  shouldReclassify,
} from "../shared/meetingClassifier.ts";

import {
  getMeetingSchema,
  extractMomentsFromChunk,
  MEETING_SCHEMAS,
} from "../shared/meetingExtractionSchemas.ts";

import {
  MEETING_CLASSIFY_MIN_CHARS,
  MEETING_SUB_TYPE_ORDER,
  type MeetingSubType,
} from "../shared/meetingIntelligenceTypes.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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
`;

const TEAM_TRANSCRIPT = `
  Alright let's kick off the standup. Maria, can you start?
  Sure. Yesterday I finished the auth refactor. Today I'm working on Sprint 14 ticket #342.
  I'm blocked on the API — waiting on Tom's PR to merge before I can proceed.
  Tom, what's your status? I'll have the PR ready by end of day Friday.
  The decision from last meeting stands — we're going with the new auth flow.
  Action item: Tom ships the PR by Friday, Maria picks up ticket #342 after merge.
  Let's circle back on the deployment question at the next sync.
  Risk: if the PR slips past Friday we miss the sprint deadline.
  Any open questions? Still unclear on the rollback strategy — let's table that for async.
`;

const PRODUCT_TRANSCRIPT = `
  Let's start with the roadmap review. We've got three feature requests from users this week.
  The top ask is better CSV export — multiple customers have complained about the UX friction.
  There's a p1 bug in the filtering flow that we need to triage today.
  Design decision: we're going with the single-page modal, not the sidebar — agreed.
  The export feature is moving to the v2.3 milestone, shipping by end of month.
  Deprioritizing the advanced search for now — too much scope creep for this sprint.
  Action item: Alex builds the CSV export, Lisa does the UX review by Wednesday.
  Risk of scope creep if we're not careful with the filtering bug fix.
  Open question: do we need a backwards-compatible API change or can we break it?
`;

const CLIENT_TRANSCRIPT = `
  Thanks for joining the quarterly business review. How has Q2 been for your team?
  Honestly, we're a bit frustrated — the onboarding took longer than we expected.
  We promised them the integration would be live by end of Q2 and it slipped.
  They're at risk of churning if we don't resolve this quickly.
  Commitment: we'll have the integration fixed and deployed by next Friday.
  I'll personally follow up with the customer success manager today.
  The NPS score dropped this quarter — we need to address that.
  Open question: should we offer them a service credit for the delay?
  Action item: Escalate to engineering, get the fix timeline confirmed by EOD.
`;

const AMBIGUOUS_TRANSCRIPT = `
  Hello everyone, let's get started.
  So I wanted to chat about a few things.
  What do you think about the current situation?
  We might need to look into some options.
  Let me know what you think.
  Thanks for joining.
`;

// ─── classifyMeeting() ────────────────────────────────────────────────────────

test("classifyMeeting returns null below MEETING_CLASSIFY_MIN_CHARS", () => {
  const result = classifyMeeting({ transcript: "Too short." });
  assert.equal(result, null);
});

test("classifyMeeting returns null for empty transcript", () => {
  assert.equal(classifyMeeting({ transcript: "" }), null);
  assert.equal(classifyMeeting({ transcript: "   " }), null);
});

test("classifyMeeting: MEETING_CLASSIFY_MIN_CHARS is a positive number", () => {
  assert.ok(MEETING_CLASSIFY_MIN_CHARS > 0);
  assert.ok(typeof MEETING_CLASSIFY_MIN_CHARS === "number");
});

test("classifyMeeting detects sales_external from transcript", () => {
  const result = classifyMeeting({ transcript: SALES_TRANSCRIPT });
  assert.ok(result !== null, "should classify");
  assert.equal(result.subType, "sales_external");
  assert.ok(result.confidence > 0, "confidence > 0");
  assert.ok(result.signals.length > 0, "signals captured");
  assert.ok(!result.manualOverride);
});

test("classifyMeeting detects sales_external from app hint (HubSpot)", () => {
  // Even with a neutral transcript, app name should tip it
  const neutralTranscript = "a".repeat(MEETING_CLASSIFY_MIN_CHARS + 1);
  const result = classifyMeeting({
    transcript: neutralTranscript,
    appName: "HubSpot CRM",
  });
  assert.ok(result !== null);
  assert.equal(result.subType, "sales_external");
  assert.ok(result.signals.some((s) => s.startsWith("app:")));
});

test("classifyMeeting detects team_internal from transcript", () => {
  const result = classifyMeeting({ transcript: TEAM_TRANSCRIPT });
  assert.ok(result !== null);
  assert.equal(result.subType, "team_internal");
  assert.ok(result.confidence > 0);
});

test("classifyMeeting detects team_internal from window title (standup)", () => {
  const neutralTranscript = "a".repeat(MEETING_CLASSIFY_MIN_CHARS + 1);
  const result = classifyMeeting({
    transcript: neutralTranscript,
    windowTitle: "Daily Standup - Zoom Meeting",
  });
  assert.ok(result !== null);
  assert.equal(result.subType, "team_internal");
  assert.ok(result.signals.some((s) => s.startsWith("title:")));
});

test("classifyMeeting detects product_review from transcript", () => {
  const result = classifyMeeting({ transcript: PRODUCT_TRANSCRIPT });
  assert.ok(result !== null);
  assert.equal(result.subType, "product_review");
  assert.ok(result.confidence > 0);
});

test("classifyMeeting detects client_account from transcript", () => {
  const result = classifyMeeting({ transcript: CLIENT_TRANSCRIPT });
  assert.ok(result !== null);
  assert.equal(result.subType, "client_account");
  assert.ok(result.confidence > 0);
});

test("classifyMeeting falls through to general for ambiguous transcript", () => {
  const result = classifyMeeting({ transcript: AMBIGUOUS_TRANSCRIPT.repeat(3) });
  assert.ok(result !== null);
  assert.equal(result.subType, "general");
});

test("classifyMeeting returns scores for all 5 sub-types", () => {
  const result = classifyMeeting({ transcript: SALES_TRANSCRIPT });
  assert.ok(result !== null);
  for (const subType of MEETING_SUB_TYPE_ORDER) {
    assert.ok(subType in result.scores, `scores has ${subType}`);
    assert.ok(typeof result.scores[subType] === "number");
  }
});

test("classifyMeeting: app hint outweighs weak transcript signal", () => {
  // Transcript is weak but Salesforce app is a very strong sales signal
  const weakTranscript = "Let's chat. How are things going? ".repeat(12);
  const result = classifyMeeting({
    transcript: weakTranscript,
    appName: "Salesforce Lightning",
  });
  assert.ok(result !== null);
  assert.equal(result.subType, "sales_external");
});

// ─── applyMeetingTypeOverride() ───────────────────────────────────────────────

test("applyMeetingTypeOverride sets manualOverride=true and confidence=1", () => {
  const override = applyMeetingTypeOverride(null, "product_review");
  assert.equal(override.subType, "product_review");
  assert.equal(override.manualOverride, true);
  assert.equal(override.confidence, 1.0);
  assert.ok(override.signals.includes("manual_override"));
});

test("applyMeetingTypeOverride preserves prior scores when available", () => {
  const prior = classifyMeeting({ transcript: SALES_TRANSCRIPT })!;
  const override = applyMeetingTypeOverride(prior, "team_internal");
  assert.equal(override.subType, "team_internal");
  assert.ok(override.scores.sales_external > 0, "prior sales scores preserved");
});

// ─── shouldReclassify() ──────────────────────────────────────────────────────

test("shouldReclassify returns false for manual override", () => {
  const classification = applyMeetingTypeOverride(null, "general");
  assert.equal(shouldReclassify(classification, 300, 2000, false), false);
});

test("shouldReclassify returns false when already attempted", () => {
  const classification = classifyMeeting({ transcript: AMBIGUOUS_TRANSCRIPT.repeat(3) })!;
  assert.equal(shouldReclassify(classification, 300, 2000, true), false);
});

test("shouldReclassify returns false when confidence is already high", () => {
  const classification = classifyMeeting({ transcript: SALES_TRANSCRIPT })!;
  // Force high confidence scenario
  const highConf = { ...classification, confidence: 0.85 };
  assert.equal(shouldReclassify(highConf, 300, 2000, false), false);
});

test("shouldReclassify returns true when low confidence and enough new transcript", () => {
  const classification = classifyMeeting({ transcript: AMBIGUOUS_TRANSCRIPT.repeat(3) })!;
  const lowConf = { ...classification, confidence: 0.3 };
  assert.equal(shouldReclassify(lowConf, 300, 1500, false), true);
});

test("shouldReclassify returns false when not enough new transcript yet", () => {
  const classification = classifyMeeting({ transcript: AMBIGUOUS_TRANSCRIPT.repeat(3) })!;
  const lowConf = { ...classification, confidence: 0.3 };
  assert.equal(shouldReclassify(lowConf, 300, 800, false), false);
});

// ─── extractMomentsFromChunk() ───────────────────────────────────────────────

test("extractMomentsFromChunk: sales schema extracts customer_signal from pain", () => {
  const schema = getMeetingSchema("sales_external");
  const chunk = "We're really struggling with our current process, it's too slow and our team hates it.";
  const moments = extractMomentsFromChunk(chunk, schema);
  assert.ok(moments.some((m) => m.type === "customer_signal"), "customer_signal extracted");
});

test("extractMomentsFromChunk: sales schema extracts deal_signal from BANT", () => {
  const schema = getMeetingSchema("sales_external");
  const chunk = "Our budget is approved for Q3 and our VP of Sales has sign-off authority.";
  const moments = extractMomentsFromChunk(chunk, schema);
  assert.ok(moments.some((m) => m.type === "deal_signal"), "deal_signal extracted");
});

test("extractMomentsFromChunk: team schema extracts decision", () => {
  const schema = getMeetingSchema("team_internal");
  const chunk = "We decided to go with the new auth flow. Maria is the owner and the deadline is Friday.";
  const moments = extractMomentsFromChunk(chunk, schema);
  assert.ok(moments.some((m) => m.type === "decision"), "decision extracted");
  assert.ok(moments.some((m) => m.type === "action_item"), "action_item extracted");
});

test("extractMomentsFromChunk: team schema extracts blocker", () => {
  const schema = getMeetingSchema("team_internal");
  const chunk = "I'm blocked waiting on the API PR to merge before I can continue.";
  const moments = extractMomentsFromChunk(chunk, schema);
  assert.ok(moments.some((m) => m.type === "blocker"), "blocker extracted");
});

test("extractMomentsFromChunk: product schema extracts product_feedback from bug", () => {
  const schema = getMeetingSchema("product_review");
  const chunk = "There's a p1 bug in the filtering flow that users are reporting — needs to be triaged today.";
  const moments = extractMomentsFromChunk(chunk, schema);
  assert.ok(moments.some((m) => m.type === "product_feedback"), "product_feedback extracted");
});

test("extractMomentsFromChunk: product schema extracts product_feedback from feature request", () => {
  const schema = getMeetingSchema("product_review");
  const chunk = "Multiple customers are asking for CSV export — it's a clear feature request we should prioritize.";
  const moments = extractMomentsFromChunk(chunk, schema);
  assert.ok(moments.some((m) => m.type === "product_feedback"));
});

test("extractMomentsFromChunk: client schema extracts commitment", () => {
  const schema = getMeetingSchema("client_account");
  const chunk = "We'll have the integration fixed and deployed by next Friday, I promise.";
  const moments = extractMomentsFromChunk(chunk, schema);
  assert.ok(moments.some((m) => m.type === "commitment"), "commitment extracted");
});

test("extractMomentsFromChunk: client schema extracts churn risk", () => {
  const schema = getMeetingSchema("client_account");
  const chunk = "They're at risk of churning if we don't resolve this issue quickly.";
  const moments = extractMomentsFromChunk(chunk, schema);
  assert.ok(moments.some((m) => m.type === "risk"), "churn risk extracted");
});

test("extractMomentsFromChunk: general schema extracts all base types", () => {
  const schema = getMeetingSchema("general");
  const chunks = [
    "We agreed to go with option B.",                    // decision
    "Tom will send the report by EOD Friday.",           // action_item
    "There's a risk we might miss the deadline.",        // risk
    "We're blocked waiting for legal sign-off.",         // blocker
    "Still unclear on the budget — tbd.",                // open_question
    "Let's circle back on this next week.",              // follow_up
  ];
  for (const chunk of chunks) {
    const moments = extractMomentsFromChunk(chunk, schema);
    assert.ok(moments.length > 0, `expected moment from: "${chunk.slice(0, 40)}"`);
  }
});

test("extractMomentsFromChunk: returns empty array for content-free chunk", () => {
  const schema = getMeetingSchema("general");
  const moments = extractMomentsFromChunk("Hey, how are you? Good to see you.", schema);
  assert.equal(moments.length, 0);
});

test("extractMomentsFromChunk: dedupes identical sentences", () => {
  const schema = getMeetingSchema("team_internal");
  const repeated = "We decided to go with option A. ".repeat(5);
  const moments = extractMomentsFromChunk(repeated, schema);
  const decisions = moments.filter((m) => m.type === "decision");
  assert.equal(decisions.length, 1, "deduped to one decision");
});

// ─── Schema completeness ─────────────────────────────────────────────────────

test("all 5 sub-types have a schema registered", () => {
  for (const subType of MEETING_SUB_TYPE_ORDER) {
    const schema = getMeetingSchema(subType);
    assert.ok(schema, `schema exists for ${subType}`);
    assert.equal(schema.subType, subType);
  }
});

test("every schema has at least 3 active moment types", () => {
  for (const subType of MEETING_SUB_TYPE_ORDER) {
    const schema = getMeetingSchema(subType);
    assert.ok(schema.activeTypes.length >= 3, `${subType} has >= 3 active types`);
  }
});

test("every schema has moment patterns for each active type", () => {
  for (const subType of MEETING_SUB_TYPE_ORDER) {
    const schema = getMeetingSchema(subType);
    for (const activeType of schema.activeTypes) {
      const hasPattern = schema.momentPatterns.some((p) => p.type === activeType);
      assert.ok(hasPattern, `${subType} has pattern for ${activeType}`);
    }
  }
});

test("every schema has a non-empty trackingLabel", () => {
  for (const subType of MEETING_SUB_TYPE_ORDER) {
    const schema = getMeetingSchema(subType);
    assert.ok(schema.trackingLabel.length > 0, `${subType} trackingLabel non-empty`);
  }
});

test("MEETING_SCHEMAS covers all 5 sub-types", () => {
  const schemaKeys = Object.keys(MEETING_SCHEMAS) as MeetingSubType[];
  for (const subType of MEETING_SUB_TYPE_ORDER) {
    assert.ok(schemaKeys.includes(subType), `MEETING_SCHEMAS has ${subType}`);
  }
  assert.equal(schemaKeys.length, MEETING_SUB_TYPE_ORDER.length);
});
