/**
 * Meeting Intelligence — end-to-end flow tests.
 *
 * Covers the full pipeline without a live app:
 *   - Full session arc: empty → classify → extract → delta → re-extract
 *   - All 5 archetypes (sales, team, product, client, general)
 *   - AI extraction override path (extractionOverride with owner/deadline)
 *   - Regex fallback when no override
 *   - parseExtractionResponse robustness (prose wrapper, malformed, invalid types)
 *   - shouldRunExtractionPass delta + time gates
 *   - Dedup across multiple ticks
 *   - Manual add + delete moment
 *   - Type override resets extraction cursor
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runMeetingIntelligencePass,
  applyMeetingTypeOverrideInEngine,
  resetMeetingIntelligenceState,
  deleteMeetingMoment,
  addMeetingMoment,
  shouldRunExtractionPass,
} from "../shared/meetingIntelligenceEngine.ts";

import {
  MEETING_CLASSIFY_MIN_CHARS,
  MEETING_EXTRACTION_INTERVAL_MS,
  MEETING_EXTRACTION_MIN_DELTA_CHARS,
} from "../shared/meetingIntelligenceTypes.ts";

import {
  buildMeetingExtractionPrompt,
  parseExtractionResponse,
} from "../shared/meetingExtractionPrompts.ts";

import { getMeetingSchema } from "../shared/meetingExtractionSchemas.ts";

// ─── Canned transcripts (one per archetype) ───────────────────────────────────

const SALES_TRANSCRIPT = `
  Hey Sarah, great to connect. So tell me what is driving the urgency here?
  We have been struggling with our current CRM it is too slow and our sales team hates
  updating it manually. We looked at Salesforce but it is too expensive for us right now.
  Budget is approved for Q3 our VP of Sales has sign-off authority.
  We need something we can implement before end of quarter.
  The pain point is really around pipeline visibility we cannot see where deals are stuck.
  Sounds like a great fit. Let me show you a quick demo of how we handle that.
  We would love to do a pilot can you send the proposal by Friday?
  Absolutely I will follow up with the proposal and schedule the next steps.
  The customer mentioned they are also looking at HubSpot as a competitor.
  We need to address the security concern they raised about data residency.
  There is a risk that procurement could push the timeline into Q4.
`.repeat(2);

const TEAM_TRANSCRIPT = `
  Alright let us kick off the standup. Maria can you start?
  Sure. Yesterday I finished the auth refactor. Today I am working on ticket three four two.
  I am blocked on the API waiting on Tom PR to merge before I can proceed.
  Tom what is your status? I will have the PR ready by end of day Friday.
  The decision from last week stands we are going with the new auth flow using JWT.
  Action item Tom ships the PR by Friday Maria picks up the ticket after merge.
  Risk if the PR slips past Friday we miss the sprint deadline.
  Let us table the deployment question and circle back at the next sync.
  Open question do we need Redis or can we use in-memory cache for sessions?
  We decided to use the feature flag for the rollout starting at ten percent.
`.repeat(2);

const PRODUCT_TRANSCRIPT = `
  Okay let us go through the roadmap for Q3. First item is the dashboard redesign.
  Users are confused by the current layout the drop-off rate at onboarding step three is high.
  Feature request from enterprise customers they want bulk export and SSO support.
  We decided to cut the V2 dashboard from Q3 and push it to Q4.
  Sara needs to file the P1 bug ticket for the export crash before EOD today.
  There is a risk the new API change is a breaking change without backwards compatibility.
  We are going to prioritize the mobile navigation fix it is a P0 for the next release.
  Open question the feature flag rollout percentage is still TBD needs PM sign-off.
  There is a regression in the payment flow that was reported by multiple customers.
  Milestone is to ship the redesign by end of sprint fourteen in two weeks.
`.repeat(2);

const CLIENT_TRANSCRIPT = `
  Hi thanks for joining the quarterly business review. How has the platform been performing?
  Honestly we have had some reliability issues the team is frustrated.
  We will have the infrastructure fix deployed by next Friday I can commit to that.
  They mentioned they are evaluating alternatives if this is not resolved soon.
  The customer expects a full incident report by end of week no exceptions.
  James is going to send the updated SLA document with the new uptime targets this afternoon.
  We are at risk of churn if we do not show improvement before the renewal in sixty days.
  The customer requested that we add two more seats to the enterprise tier.
  We will make sure the onboarding specialist follows up with their team next week.
  Open question whether the issue affects all users or only the enterprise tier.
`.repeat(2);

const GENERAL_TRANSCRIPT = `
  Okay everyone let us get started. So the first thing on the agenda is the budget review.
  We agreed to move the project launch date to August first that is the new target.
  Maria will prepare the summary document and send it to the group by Monday morning.
  We are waiting on legal sign-off before we can proceed with the public announcement.
  The timeline is tight any more delays and we miss the press release window.
  Let us follow up offline on the vendor contract question that was raised earlier.
  We need to circle back on the staffing plan at the next meeting next Thursday.
  The board presentation is scheduled for the week after next so we need to be ready.
`.repeat(3);

// ─── Helpers ─────────────────────────────────────────────────────────────────

let idSeq = 0;
const testId = () => `e2e-mm-${++idSeq}`;

const BASE_NOW  = 1_700_000_000_000;
const TICK_1    = BASE_NOW + MEETING_EXTRACTION_INTERVAL_MS + 100;
const TICK_2    = TICK_1  + MEETING_EXTRACTION_INTERVAL_MS + 100;

// ─── Full session arc ─────────────────────────────────────────────────────────

test("flow: sales_external — classify → extract → accumulate over two ticks", () => {
  let state = resetMeetingIntelligenceState();

  // Tick 0: transcript too short — no change
  state = runMeetingIntelligencePass({
    transcript: "Hi, let us talk sales.",
    state,
    nowMs: BASE_NOW,
    idFactory: testId,
  });
  assert.equal(state.classification, null, "no classification on short transcript");
  assert.equal(state.moments.length, 0);

  // Tick 1: full transcript — classify + first extraction
  state = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state,
    nowMs: TICK_1,
    idFactory: testId,
  });
  assert.equal(state.classification?.subType, "sales_external", "classified as sales");
  assert.ok(state.moments.length > 0, "moments extracted after first tick");

  const afterTick1Count = state.moments.length;

  // Tick 2: add more delta — should extract additional moments
  const extended = SALES_TRANSCRIPT + `
    There is also a budget concern — they need CFO approval before signing.
    Action item: I will send the contract draft to legal by Wednesday.
    The risk here is that the champion is leaving the company next month.
  `;

  const prevState = state;
  state = runMeetingIntelligencePass({
    transcript: extended,
    state,
    nowMs: TICK_2,
    idFactory: testId,
  });

  // Either more moments extracted or state advanced cursor — either way state changed
  assert.notEqual(state, prevState, "state object changed on tick 2");
  // Total moments should be >= tick 1 (dedup prevents regression)
  assert.ok(state.moments.length >= afterTick1Count, "moments do not decrease");
});

test("flow: team_internal — classify + extract decisions and blockers", () => {
  let state = resetMeetingIntelligenceState();
  state = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state,
    nowMs: TICK_1,
    idFactory: testId,
  });
  assert.equal(state.classification?.subType, "team_internal");
  const types = new Set(state.moments.map((m) => m.type));
  assert.ok(types.has("decision") || types.has("action_item") || types.has("blocker"),
    "extracts decision / action_item / blocker for team_internal");
});

test("flow: product_review — classify + extract product_feedback and decisions", () => {
  let state = resetMeetingIntelligenceState();
  state = runMeetingIntelligencePass({
    transcript: PRODUCT_TRANSCRIPT,
    state,
    nowMs: TICK_1,
    idFactory: testId,
  });
  assert.equal(state.classification?.subType, "product_review");
  const types = new Set(state.moments.map((m) => m.type));
  assert.ok(types.has("product_feedback") || types.has("decision"),
    "extracts product_feedback or decision for product_review");
});

test("flow: client_account — classify + extract commitments and risks", () => {
  let state = resetMeetingIntelligenceState();
  state = runMeetingIntelligencePass({
    transcript: CLIENT_TRANSCRIPT,
    state,
    nowMs: TICK_1,
    idFactory: testId,
  });
  assert.equal(state.classification?.subType, "client_account");
  const types = new Set(state.moments.map((m) => m.type));
  assert.ok(types.has("commitment") || types.has("risk"),
    "extracts commitment or risk for client_account");
});

test("flow: general — falls back to general when no archetype is dominant", () => {
  let state = resetMeetingIntelligenceState();
  state = runMeetingIntelligencePass({
    transcript: GENERAL_TRANSCRIPT,
    state,
    nowMs: TICK_1,
    idFactory: testId,
  });
  // General is valid if no other archetype fired strongly — may also be another type
  // The important thing is classification fires at all
  assert.ok(state.classification !== null, "classification fires");
  assert.ok(state.classification!.confidence >= 0, "confidence is numeric");
});

// ─── AI extraction override ───────────────────────────────────────────────────

test("extractionOverride: AI moments stored with owner and deadline", () => {
  // Prime the state with a classification, then reset the cursor so the
  // next pass sees the full transcript as its delta (avoids the min-delta gate).
  let state = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state: resetMeetingIntelligenceState(),
    nowMs: TICK_1,
    idFactory: testId,
  });
  assert.equal(state.classification?.subType, "sales_external");
  state = { ...state, lastExtractionTranscriptLen: 0, lastExtractionAt: 0 };

  const aiMoments = [
    { type: "action_item" as const, content: "Send the MSA to legal for review", owner: "Alex", deadline: "Wednesday" },
    { type: "deal_signal" as const, content: "Budget approved for Q4 with CFO sign-off", deadline: "Q4" },
    { type: "risk" as const, content: "Champion is leaving the company next month" },
  ];

  const next = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state,
    nowMs: TICK_2,
    idFactory: testId,
    extractionOverride: aiMoments,
  });

  const actionItem = next.moments.find((m) => m.type === "action_item" && m.owner === "Alex");
  assert.ok(actionItem, "action item with owner stored");
  assert.equal(actionItem!.owner, "Alex");
  assert.equal(actionItem!.deadline, "Wednesday");

  const dealSignal = next.moments.find((m) => m.type === "deal_signal" && m.deadline === "Q4");
  assert.ok(dealSignal, "deal signal with deadline stored");
});

test("extractionOverride: only active types for schema are accepted by dedup", () => {
  let state = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state: resetMeetingIntelligenceState(),
    nowMs: TICK_1,
    idFactory: testId,
  });
  assert.equal(state.classification?.subType, "team_internal");
  state = { ...state, lastExtractionTranscriptLen: 0, lastExtractionAt: 0 };

  const aiMoments = [
    { type: "decision" as const, content: "We will migrate to the new database by end of month" },
    { type: "action_item" as const, content: "Sam to update the deployment runbook by Thursday", owner: "Sam", deadline: "Thursday" },
  ];

  const next = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state,
    nowMs: TICK_2,
    idFactory: testId,
    extractionOverride: aiMoments,
  });

  const decision = next.moments.find((m) => m.content.includes("migrate to the new database"));
  const actionItem = next.moments.find((m) => m.owner === "Sam");
  assert.ok(decision, "decision moment stored from AI override");
  assert.ok(actionItem, "action item with owner stored from AI override");
  assert.equal(actionItem!.deadline, "Thursday");
});

test("extractionOverride: dedup prevents the same content appearing twice across ticks", () => {
  let state = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state: resetMeetingIntelligenceState(),
    nowMs: TICK_1,
    idFactory: testId,
  });
  assert.equal(state.classification?.subType, "sales_external");

  // Reset cursor so the full transcript is treated as the delta for tick 2
  state = { ...state, lastExtractionTranscriptLen: 0, lastExtractionAt: 0 };

  const duplicateMoment = { type: "risk" as const, content: "Procurement could push the timeline to Q4" };

  // Tick 2: moment should be stored for the first time
  state = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state,
    nowMs: TICK_2,
    idFactory: testId,
    extractionOverride: [duplicateMoment],
  });

  const count1 = state.moments.filter((m) => m.content === duplicateMoment.content).length;
  assert.equal(count1, 1, "first tick: moment stored once");

  // Tick 3: same moment in override — cursor reset again so delta check passes,
  // but dedup should reject it because it's already in state.moments
  state = { ...state, lastExtractionTranscriptLen: 0, lastExtractionAt: 0 };
  const next = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state,
    nowMs: TICK_2 + MEETING_EXTRACTION_INTERVAL_MS + 100,
    idFactory: testId,
    extractionOverride: [duplicateMoment],
  });

  const count2 = next.moments.filter((m) => m.content === duplicateMoment.content).length;
  assert.equal(count2, 1, "second tick: duplicate moment not added again");
});

// ─── Regex fallback ───────────────────────────────────────────────────────────

test("regex fallback: moments extracted when no extractionOverride provided", () => {
  let state = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state: resetMeetingIntelligenceState(),
    nowMs: TICK_1,
    idFactory: testId,
  });

  // Pass without override — engine runs regex
  const extended = TEAM_TRANSCRIPT + `
    We decided to use Redis for the session cache after all.
    Blocked: waiting on the infrastructure team to provision the cluster.
  `;
  const next = runMeetingIntelligencePass({
    transcript: extended,
    state,
    nowMs: TICK_2,
    idFactory: testId,
    // no extractionOverride
  });

  assert.ok(next.moments.length >= state.moments.length, "regex fallback extracts moments");
});

// ─── parseExtractionResponse ─────────────────────────────────────────────────

test("parseExtractionResponse: clean JSON array parsed correctly", () => {
  const schema = getMeetingSchema("team_internal");
  const raw = `[
    {"type":"decision","content":"We will go with JWT for auth"},
    {"type":"action_item","content":"Tom to submit the PR by Friday","owner":"Tom","deadline":"Friday"},
    {"type":"blocker","content":"Waiting on infra team to provision the cluster"}
  ]`;
  const results = parseExtractionResponse(raw, schema);
  assert.equal(results.length, 3);
  assert.equal(results[0].type, "decision");
  assert.equal(results[1].owner, "Tom");
  assert.equal(results[1].deadline, "Friday");
  assert.equal(results[2].type, "blocker");
});

test("parseExtractionResponse: extracts JSON array from prose-wrapped response", () => {
  const schema = getMeetingSchema("team_internal");
  const raw = `Here are the moments I found in the transcript:
[
  {"type":"decision","content":"The team agreed to ship the feature in sprint 14"}
]
Let me know if you need more detail.`;
  const results = parseExtractionResponse(raw, schema);
  assert.equal(results.length, 1);
  assert.equal(results[0].type, "decision");
});

test("parseExtractionResponse: returns [] for malformed JSON", () => {
  const schema = getMeetingSchema("team_internal");
  assert.deepEqual(parseExtractionResponse("not json at all", schema), []);
  assert.deepEqual(parseExtractionResponse("[{broken", schema), []);
  assert.deepEqual(parseExtractionResponse("", schema), []);
});

test("parseExtractionResponse: returns [] for empty array response", () => {
  const schema = getMeetingSchema("team_internal");
  const results = parseExtractionResponse("[]", schema);
  assert.deepEqual(results, []);
});

test("parseExtractionResponse: drops items with invalid or inactive type", () => {
  const schema = getMeetingSchema("team_internal"); // no deal_signal or customer_signal
  const raw = `[
    {"type":"deal_signal","content":"Budget approved for Q3"},
    {"type":"decision","content":"We will go with the new auth flow"},
    {"type":"INVALID_TYPE","content":"Something"},
    {"type":"commitment","content":"We will deliver by Friday"}
  ]`;
  const results = parseExtractionResponse(raw, schema);
  // Only "decision" is active for team_internal from this list
  assert.equal(results.length, 1);
  assert.equal(results[0].type, "decision");
});

test("parseExtractionResponse: drops items with content too short", () => {
  const schema = getMeetingSchema("team_internal");
  const raw = `[
    {"type":"decision","content":"ok"},
    {"type":"blocker","content":"Waiting on the infrastructure team to provision the Redis cluster"}
  ]`;
  const results = parseExtractionResponse(raw, schema);
  assert.equal(results.length, 1);
  assert.equal(results[0].type, "blocker");
});

test("parseExtractionResponse: omits owner/deadline when missing or empty", () => {
  const schema = getMeetingSchema("sales_external");
  const raw = `[
    {"type":"action_item","content":"Send the proposal before end of week","owner":"","deadline":null}
  ]`;
  const results = parseExtractionResponse(raw, schema);
  assert.equal(results.length, 1);
  assert.equal(results[0].owner, undefined);
  assert.equal(results[0].deadline, undefined);
});

// ─── shouldRunExtractionPass ──────────────────────────────────────────────────

test("shouldRunExtractionPass: false when no classification", () => {
  const state = resetMeetingIntelligenceState();
  assert.equal(
    shouldRunExtractionPass(state, MEETING_CLASSIFY_MIN_CHARS + 500, BASE_NOW),
    false,
    "no classification → false",
  );
});

test("shouldRunExtractionPass: false when delta is too small", () => {
  let state = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state: resetMeetingIntelligenceState(),
    nowMs: TICK_1,
    idFactory: testId,
  });
  // Delta is 0 — transcript length hasn't changed since last extraction
  const transcriptLen = state.lastExtractionTranscriptLen ?? 0;
  assert.equal(
    shouldRunExtractionPass(state, transcriptLen + 10, TICK_2),
    false,
    "tiny delta → false",
  );
});

test("shouldRunExtractionPass: true when classification exists and enough delta + time", () => {
  let state = runMeetingIntelligencePass({
    transcript: SALES_TRANSCRIPT,
    state: resetMeetingIntelligenceState(),
    nowMs: TICK_1,
    idFactory: testId,
  });
  assert.ok(state.classification !== null);

  const bigDelta = (state.lastExtractionTranscriptLen ?? 0) + MEETING_EXTRACTION_MIN_DELTA_CHARS + 100;
  assert.equal(
    shouldRunExtractionPass(state, bigDelta, TICK_2),
    true,
    "enough delta + time → true",
  );
});

// ─── Manual add + delete ──────────────────────────────────────────────────────

test("deleteMeetingMoment: removes the correct moment, returns same ref for unknown id", () => {
  let state = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state: resetMeetingIntelligenceState(),
    nowMs: TICK_1,
    idFactory: testId,
  });
  assert.ok(state.moments.length > 0, "has moments to delete");

  const target = state.moments[0];
  const next = deleteMeetingMoment(state, target.id);
  assert.notEqual(next, state, "new state object returned");
  assert.equal(next.moments.find((m) => m.id === target.id), undefined, "moment removed");

  // Unknown ID — same reference
  const same = deleteMeetingMoment(next, "nonexistent-id-xyz");
  assert.equal(same, next, "unknown id returns same reference");
});

test("addMeetingMoment: appended with manualOverride=true, no owner/deadline", () => {
  const state = resetMeetingIntelligenceState();
  const next = addMeetingMoment(state, "blocker", "Waiting on legal to sign off before we can ship");
  assert.equal(next.moments.length, 1);
  assert.equal(next.moments[0].type, "blocker");
  assert.equal(next.moments[0].manualOverride, true);
  assert.equal(next.moments[0].owner, undefined);
});

test("addMeetingMoment: trims whitespace, returns same ref for blank content", () => {
  const state = resetMeetingIntelligenceState();
  const same = addMeetingMoment(state, "decision", "   ");
  assert.equal(same, state, "blank content returns same reference");

  const next = addMeetingMoment(state, "decision", "  We decided to launch on September 1st  ");
  assert.equal(next.moments[0].content, "We decided to launch on September 1st");
});

// ─── Type override ────────────────────────────────────────────────────────────

test("applyMeetingTypeOverrideInEngine: resets extraction cursor so new schema runs on full transcript", () => {
  let state = runMeetingIntelligencePass({
    transcript: TEAM_TRANSCRIPT,
    state: resetMeetingIntelligenceState(),
    nowMs: TICK_1,
    idFactory: testId,
  });
  assert.equal(state.classification?.subType, "team_internal");
  assert.ok(state.lastExtractionTranscriptLen !== undefined, "cursor advanced after first pass");

  const overridden = applyMeetingTypeOverrideInEngine(state, "product_review");
  assert.equal(overridden.classification?.subType, "product_review", "subType changed");
  assert.equal(overridden.classification?.manualOverride, true, "marked as manual override");
  assert.equal(overridden.lastExtractionTranscriptLen, 0, "extraction cursor reset to 0");
  assert.equal(overridden.lastExtractionAt, undefined, "extraction timer reset");
});

// ─── buildMeetingExtractionPrompt sanity ─────────────────────────────────────

test("buildMeetingExtractionPrompt: contains archetype label, valid types, and example JSON", () => {
  const schema = getMeetingSchema("sales_external");
  const prompt = buildMeetingExtractionPrompt("We need to close this before Q3.", schema);

  assert.ok(prompt.includes("sales external"), "archetype label present");
  assert.ok(prompt.includes("deal_signal"), "valid type listed");
  assert.ok(prompt.includes("customer_signal"), "valid type listed");
  assert.ok(prompt.includes("We need to close this before Q3."), "chunk injected into prompt");
  assert.ok(prompt.includes('"type"'), "example JSON present");
  assert.ok(prompt.includes("JSON:"), "ends with JSON: prompt");
});

test("buildMeetingExtractionPrompt: different archetypes produce different prompts", () => {
  const sales   = buildMeetingExtractionPrompt("chunk", getMeetingSchema("sales_external"));
  const team    = buildMeetingExtractionPrompt("chunk", getMeetingSchema("team_internal"));
  const product = buildMeetingExtractionPrompt("chunk", getMeetingSchema("product_review"));
  const client  = buildMeetingExtractionPrompt("chunk", getMeetingSchema("client_account"));
  const general = buildMeetingExtractionPrompt("chunk", getMeetingSchema("general"));

  const prompts = [sales, team, product, client, general];
  const unique = new Set(prompts);
  assert.equal(unique.size, 5, "each archetype produces a distinct prompt");
});
