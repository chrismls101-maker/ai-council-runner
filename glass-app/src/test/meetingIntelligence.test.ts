import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBusinessMeetingDebrief,
  detectMissingMeetingFields,
  extractMeetingIntelligence,
  meetingAnswerVerdict,
} from "../shared/meetingIntelligence.ts";
import { getScenarioById, scenariosByCategory } from "../shared/qaScenarioBank.ts";

function scenarioText(id: string): string {
  const s = getScenarioById(id);
  assert.ok(s, `scenario ${id} exists`);
  return [s.transcriptChunks.join(" "), s.screenContextText].join("\n");
}

function jaccard(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3),
    );
  const setA = tok(a);
  const setB = tok(b);
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap += 1;
  return overlap / Math.max(setA.size, setB.size);
}

test("scenario bank has >= 12 meeting scenarios", () => {
  assert.ok(scenariosByCategory("meeting_call").length >= 12);
});

test("extracts sprint, participants, decisions, owners, deadlines, blockers (meeting_call_02)", () => {
  const intel = extractMeetingIntelligence(scenarioText("meeting_call_02"), {
    topic: "Sprint 14 planning",
  });
  assert.ok(intel.sprints.some((s) => /sprint\s*14/i.test(s)), "sprint number");
  assert.ok(intel.participants.includes("Maria"), "participant Maria");
  assert.ok(intel.participants.includes("Tom"), "participant Tom");
  assert.ok(intel.decisions.length > 0, "decisions");
  assert.ok(intel.actionItems.length > 0, "action items");
  assert.ok(intel.owners.includes("Maria"), "owner Maria");
  assert.ok(intel.deadlines.some((d) => /friday/i.test(d)), "deadline Friday");
  assert.ok(intel.blockers.length > 0, "blockers");
});

test("extracts customer, metrics and objections (meeting_call_04 sales discovery)", () => {
  const intel = extractMeetingIntelligence(scenarioText("meeting_call_04"));
  assert.ok(intel.customers.some((c) => /acme/i.test(c)), "customer Acme");
  assert.ok(intel.metrics.some((m) => /\$\s?42k/i.test(m)), "metric $42k");
  assert.ok(intel.blockers.length > 0, "objections as blockers");
});

test("does NOT invent owners/deadlines/decisions when absent (thin meeting_call_13)", () => {
  const intel = extractMeetingIntelligence(scenarioText("meeting_call_13"));
  assert.equal(intel.owners.length, 0);
  assert.equal(intel.deadlines.length, 0);
  assert.equal(intel.decisions.length, 0);
  const missing = detectMissingMeetingFields(intel);
  assert.ok(missing.includes("owner"));
  assert.ok(missing.includes("deadline"));
  assert.ok(missing.includes("decision"));
});

test("business debrief mentions sprint number and participants when present", () => {
  const intel = extractMeetingIntelligence(scenarioText("meeting_call_02"), {
    topic: "Sprint 14 planning",
  });
  const md = buildBusinessMeetingDebrief(intel, { title: "Sprint 14 planning" });
  assert.match(md, /Sprint 14/i);
  assert.match(md, /Maria/);
  assert.match(md, /# Meeting Debrief/);
  assert.match(md, /## Action items/);
  assert.match(md, /\| Action \| Owner \| Deadline \| Source \|/);
  assert.match(md, /## Follow-up message draft/);
  assert.match(md, /## Next meeting agenda/);
});

test("business debrief writes 'Not specified' for missing fields (never invented)", () => {
  const intel = extractMeetingIntelligence(scenarioText("meeting_call_13"));
  const md = buildBusinessMeetingDebrief(intel, { title: "Quick sync" });
  assert.match(md, /Not specified/);
  // No fabricated owner/decision text.
  assert.doesNotMatch(md, /\bMaria\b|\bTom\b/);
});

test("meeting_call_02 and meeting_call_03 debriefs are session-specific, not near-identical", () => {
  const a = buildBusinessMeetingDebrief(extractMeetingIntelligence(scenarioText("meeting_call_02")));
  const b = buildBusinessMeetingDebrief(extractMeetingIntelligence(scenarioText("meeting_call_03")));
  assert.notEqual(a, b);
  // Each debrief surfaces its own distinct facts and not the other's.
  assert.match(a, /Sprint 14|Maria|Tom/);
  assert.doesNotMatch(a, /October 14|Priya/);
  assert.match(b, /October 14|Priya/);
  assert.doesNotMatch(b, /Sprint 14|Maria|Tom/);
  // Strip shared template scaffolding before comparing content overlap.
  const contentOnly = (md: string) =>
    md
      .split("\n")
      .filter((l) => !/^#|^\||^_|Not specified|Source|Action \| Owner|Risk \| Impact/.test(l.trim()))
      .join(" ");
  assert.ok(
    jaccard(contentOnly(a), contentOnly(b)) < 0.5,
    `content too similar: ${jaccard(contentOnly(a), contentOnly(b)).toFixed(2)}`,
  );
});

test("verdict is strong for a specific answer that extracts facts + calls out missing", () => {
  const intel = extractMeetingIntelligence(scenarioText("meeting_call_02"));
  const answer =
    "Sprint 14: the team decided to cut the billing migration and focus on the API. " +
    "Action items — Maria owns the API spec (due Friday), Tom owns the auth migration (due next week). " +
    "Blocker: the staging database keeps resetting. Next step: unblock infra.";
  const result = meetingAnswerVerdict(answer, intel);
  assert.equal(result.verdict, "strong");
  assert.equal(result.hallucinatedOwner, false);
  assert.ok(result.mentionedFacts.length > 0);
});

test("verdict flags hallucinated owner when none was given", () => {
  const intel = extractMeetingIntelligence(scenarioText("meeting_call_13"));
  const fake = "Action items: ship the thing. Owner: Jessica. Deadline: Friday.";
  const result = meetingAnswerVerdict(fake, intel);
  assert.equal(result.hallucinatedOwner, true);
  assert.equal(result.verdict, "weak");
});

test("verdict is acceptable when answer states missing info on thin context", () => {
  const intel = extractMeetingIntelligence(scenarioText("meeting_call_13"));
  const honest =
    "There were no concrete action items recorded. No owner given and no deadline given. " +
    "No decision was made — the notes only mention a vague follow-up.";
  const result = meetingAnswerVerdict(honest, intel);
  assert.equal(result.hallucinatedOwner, false);
  assert.notEqual(result.verdict, "weak");
});

test("verdict is weak for a generic answer with no facts and no missing call-out", () => {
  const intel = extractMeetingIntelligence(scenarioText("meeting_call_02"));
  const generic =
    "It sounds like you had a productive meeting. Make sure to follow up and keep the team aligned on goals.";
  const result = meetingAnswerVerdict(generic, intel);
  assert.equal(result.verdict, "weak");
});
