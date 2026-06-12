/**
 * Meeting report builder tests.
 *
 * Covers:
 *   - buildMeetingReport with no classification (falls back to general)
 *   - buildMeetingReport with no moments (empty sections, correct markdown)
 *   - buildMeetingReport with moments for all 5 sub-types
 *   - Section ordering follows MEETING_REPORT_SECTION_ORDER
 *   - Section labels use schema.reportSectionLabels
 *   - Moment formatting (owner + deadline appended)
 *   - buildMeetingReportSections produces heading+items pairs
 *   - Markdown contains expected strings
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMeetingReport,
  buildMeetingReportSections,
} from "../shared/meetingReport.ts";

import {
  MEETING_REPORT_SECTION_ORDER,
  MEETING_MOMENT_ICONS,
  type MeetingIntelligenceState,
  type MeetingMoment,
  type MeetingSubType,
} from "../shared/meetingIntelligenceTypes.ts";
import { getMeetingSchema } from "../shared/meetingExtractionSchemas.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_NOW = 1_700_000_000_000;

function makeState(
  subType: MeetingSubType,
  moments: MeetingMoment[] = [],
  manualOverride = false,
): MeetingIntelligenceState {
  return {
    classification: {
      subType,
      confidence: 0.9,
      signals: [],
      classifiedAt: BASE_NOW,
      manualOverride,
      scores: { sales_external: 0, team_internal: 0, product_review: 0, client_account: 0, general: 0 },
    },
    moments,
  };
}

function makeMoment(
  id: string,
  type: MeetingMoment["type"],
  content: string,
  owner?: string,
  deadline?: string,
): MeetingMoment {
  return { id, type, content, detectedAt: BASE_NOW, owner, deadline };
}

// ─── No classification ────────────────────────────────────────────────────────

test("buildMeetingReport: no classification → uses general schema", () => {
  const state: MeetingIntelligenceState = { classification: null, moments: [] };
  const report = buildMeetingReport(state);
  assert.equal(report.subType, "general");
  assert.equal(report.momentCount, 0);
  assert.equal(report.sections.length, 0);
  assert.ok(report.markdown.includes("# Meeting Debrief"));
});

// ─── Empty moments ────────────────────────────────────────────────────────────

test("buildMeetingReport: empty moments → empty sections, correct type header", () => {
  const state = makeState("team_internal");
  const report = buildMeetingReport(state);
  assert.equal(report.subType, "team_internal");
  assert.equal(report.momentCount, 0);
  assert.equal(report.sections.length, 0);
  assert.ok(report.markdown.includes("Team Meeting"));
  assert.ok(report.markdown.includes("No moments were captured"));
});

test("buildMeetingReport: manual override noted in markdown", () => {
  const state = makeState("sales_external", [], true);
  const report = buildMeetingReport(state, { sessionTitle: "Q3 Discovery" });
  assert.ok(report.manualOverride);
  assert.ok(report.markdown.includes("type set manually"));
  assert.ok(report.markdown.includes("Q3 Discovery"));
});

test("buildMeetingReport: auto-detected noted in markdown when not manual", () => {
  const state = makeState("team_internal");
  const report = buildMeetingReport(state);
  assert.ok(!report.manualOverride);
  assert.ok(report.markdown.includes("auto-detected"));
});

// ─── Section ordering ─────────────────────────────────────────────────────────

test("buildMeetingReport: sales_external sections follow MEETING_REPORT_SECTION_ORDER", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "deal_signal", "Budget approved Q3"),
    makeMoment("m2", "customer_signal", "Pain: CRM too slow"),
    makeMoment("m3", "action_item", "Send proposal by Friday"),
    makeMoment("m4", "risk", "Competitor also in evaluation"),
    makeMoment("m5", "decision", "Agreed to pilot"),
  ];
  const state = makeState("sales_external", moments);
  const report = buildMeetingReport(state);

  assert.equal(report.momentCount, 5);
  assert.ok(report.sections.length > 0);

  // Sections should appear in schema order
  const sectionTypes = report.sections.map((s) => s.type);
  const schemaOrder = MEETING_REPORT_SECTION_ORDER["sales_external"];
  const filtered = schemaOrder.filter((t) => sectionTypes.includes(t));
  assert.deepEqual(sectionTypes, filtered, "sections follow schema order");
});

test("buildMeetingReport: team_internal leads with decision section", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "decision", "We're going with the new auth flow"),
    makeMoment("m2", "action_item", "Tom ships PR by Friday"),
    makeMoment("m3", "blocker", "Waiting on API PR"),
  ];
  const state = makeState("team_internal", moments);
  const report = buildMeetingReport(state);
  assert.equal(report.sections[0].type, "decision", "team meetings lead with decisions");
});

test("buildMeetingReport: client_account leads with commitment section", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "commitment", "We'll have the integration fixed by next Friday"),
    makeMoment("m2", "risk", "Customer at risk of churning"),
  ];
  const state = makeState("client_account", moments);
  const report = buildMeetingReport(state);
  assert.equal(report.sections[0].type, "commitment", "client meetings lead with commitments");
});

test("buildMeetingReport: product_review leads with decision section", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "product_feedback", "Bug in filtering flow — p1"),
    makeMoment("m2", "decision", "Shipping CSV export in v2.3"),
  ];
  const state = makeState("product_review", moments);
  const report = buildMeetingReport(state);
  assert.equal(report.sections[0].type, "decision", "product reviews lead with decisions");
});

// ─── Section labels ───────────────────────────────────────────────────────────

test("buildMeetingReport: section headings use schema.reportSectionLabels", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "deal_signal", "Budget is approved for Q3"),
    makeMoment("m2", "customer_signal", "Pain: too slow"),
  ];
  const state = makeState("sales_external", moments);
  const report = buildMeetingReport(state);
  const schema = getMeetingSchema("sales_external");

  for (const section of report.sections) {
    const expectedLabel = schema.reportSectionLabels[section.type] ?? section.type;
    assert.equal(section.heading, expectedLabel, `heading matches schema label for ${section.type}`);
  }
});

test("buildMeetingReport: sections include correct icon from MEETING_MOMENT_ICONS", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "decision", "We agreed on approach B"),
  ];
  const state = makeState("general", moments);
  const report = buildMeetingReport(state);
  assert.equal(report.sections[0].icon, MEETING_MOMENT_ICONS["decision"]);
});

// ─── Moment formatting ────────────────────────────────────────────────────────

test("buildMeetingReport: owner appended to item with →", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "action_item", "Send proposal by Friday", "Alex"),
  ];
  const state = makeState("general", moments);
  const report = buildMeetingReport(state);
  assert.ok(report.sections[0].items[0].includes("→ Alex"));
});

test("buildMeetingReport: deadline appended to item with 'by'", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "action_item", "Submit report", undefined, "Friday"),
  ];
  const state = makeState("general", moments);
  const report = buildMeetingReport(state);
  assert.ok(report.sections[0].items[0].includes("(by Friday)"));
});

test("buildMeetingReport: owner + deadline both appended", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "action_item", "Fix the auth bug", "Maria", "EOD Friday"),
  ];
  const state = makeState("team_internal", moments);
  const report = buildMeetingReport(state);
  const item = report.sections[0].items[0];
  assert.ok(item.includes("→ Maria"));
  assert.ok(item.includes("(by EOD Friday)"));
});

// ─── Markdown output ──────────────────────────────────────────────────────────

test("buildMeetingReport: markdown has H1 header", () => {
  const state = makeState("general");
  const { markdown } = buildMeetingReport(state);
  assert.ok(markdown.startsWith("# Meeting Debrief"));
});

test("buildMeetingReport: markdown includes session title when provided", () => {
  const state = makeState("general");
  const { markdown } = buildMeetingReport(state, { sessionTitle: "Friday Standup" });
  assert.ok(markdown.includes("Friday Standup"));
});

test("buildMeetingReport: markdown has H2 section headings with icon", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "decision", "Go with option A"),
  ];
  const state = makeState("general", moments);
  const { markdown } = buildMeetingReport(state);
  // Should have ## ✅ Decisions
  assert.ok(markdown.includes("## ✅"), "H2 heading with icon");
});

test("buildMeetingReport: markdown has bullet points for items", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "action_item", "Tom ships the PR"),
    makeMoment("m2", "action_item", "Maria picks up ticket after merge"),
  ];
  const state = makeState("team_internal", moments);
  const { markdown } = buildMeetingReport(state);
  const bulletLines = markdown.split("\n").filter((l) => l.startsWith("- "));
  assert.ok(bulletLines.length >= 2, "at least 2 bullet lines");
});

test("buildMeetingReport: markdown has separator line", () => {
  const state = makeState("general");
  const { markdown } = buildMeetingReport(state);
  assert.ok(markdown.includes("---"));
});

// ─── buildMeetingReportSections ──────────────────────────────────────────────

test("buildMeetingReportSections: returns heading+items pairs", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "decision", "We decided to ship v2 early"),
    makeMoment("m2", "blocker", "Blocked waiting for legal sign-off"),
  ];
  const state = makeState("team_internal", moments);
  const sections = buildMeetingReportSections(state);

  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.ok(typeof section.heading === "string", "heading is string");
    assert.ok(Array.isArray(section.items), "items is array");
    assert.ok(section.items.length > 0, "section has items");
  }
});

test("buildMeetingReportSections: headings include icon from MEETING_MOMENT_ICONS", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "risk", "Risk of scope creep"),
  ];
  const state = makeState("general", moments);
  const sections = buildMeetingReportSections(state);
  const riskSection = sections.find((s) => s.heading.includes("Risk") || s.heading.includes("⚠"));
  assert.ok(riskSection, "risk section found");
  assert.ok(riskSection!.heading.includes("⚠️"), "risk heading has icon");
});

test("buildMeetingReportSections: empty state returns empty array", () => {
  const state: MeetingIntelligenceState = { classification: null, moments: [] };
  const sections = buildMeetingReportSections(state);
  assert.equal(sections.length, 0);
});

// ─── momentCount ─────────────────────────────────────────────────────────────

test("buildMeetingReport: momentCount equals total moments in state", () => {
  const moments: MeetingMoment[] = [
    makeMoment("m1", "decision", "Decision A"),
    makeMoment("m2", "action_item", "Action B"),
    makeMoment("m3", "risk", "Risk C"),
  ];
  const state = makeState("general", moments);
  const report = buildMeetingReport(state);
  assert.equal(report.momentCount, 3);
});

test("buildMeetingReport: only non-empty sections appear in sections array", () => {
  // Only one moment type present
  const moments: MeetingMoment[] = [
    makeMoment("m1", "decision", "We decided X"),
  ];
  const state = makeState("general", moments);
  const report = buildMeetingReport(state);
  // Should have exactly one section (decision only)
  assert.equal(report.sections.length, 1);
  assert.equal(report.sections[0].type, "decision");
});
