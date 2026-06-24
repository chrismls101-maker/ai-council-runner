import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildListenReportMarkdown,
  buildListenReportSections,
} from "../shared/listenReport.ts";
import type { GlassSession } from "../shared/sessionTypes.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";

function session(): GlassSession {
  const now = new Date().toISOString();
  return {
    id: "s1",
    title: "Listen session",
    status: "ended",
    startedAt: now,
    updatedAt: now,
    events: [],
    insights: [],
  };
}

function moment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const now = new Date().toISOString();
  return {
    id: "m1",
    type: "key_idea",
    summary: "Distribution beats speed.",
    transcriptAnchors: ["Distribution beats speed for founders building in public."],
    firstSeenAt: now,
    lastUpdatedAt: now,
    confidence: 0.9,
    importance: "high",
    suggestedThought: "The speaker argues distribution beats speed for founders.",
    reasonSelected: "High-signal founder insight about go-to-market.",
    status: "surfaced",
    ...overrides,
  };
}

test("report includes Core ideas from Live Notes", () => {
  const sections = buildListenReportSections({
    session: session(),
    moments: [moment()],
  });
  const heading = sections.find((s) => s.heading === "Core ideas");
  assert.ok(heading);
  assert.match(heading!.items[0]!, /distribution|founder/i);
});

test("thin report explains missing content moments", () => {
  const sections = buildListenReportSections({
    session: session(),
    moments: [moment({ segmentKind: "ad", status: "saved_silently" })],
  });
  const about = sections.find((s) => s.heading === "What this was about");
  assert.ok(about);
  assert.match(about!.items[0]!, /Not enough main-content moments/i);
});

test("markdown includes persona intro and Final takeaway", () => {
  const sections = buildListenReportSections({ session: session(), moments: [moment()] });
  const md = buildListenReportMarkdown(sections);
  assert.match(md, /Listen Report/);
  assert.match(md, /Thought Partner/i);
  assert.match(md, /## Final takeaway/);
});
