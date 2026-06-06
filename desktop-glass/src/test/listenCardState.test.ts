import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyListenCardSurface,
  clearListenCardRuntimeState,
  decideListenCardSurface,
  filterFeedToSingleListenCard,
  initialListenCardRuntimeState,
} from "../shared/listenCardState.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";

function moment(id: string, type: ListenMoment["type"] = "key_idea"): ListenMoment {
  const now = new Date().toISOString();
  return {
    id,
    type,
    summary: "Distribution may matter more than software speed for founders.",
    transcriptAnchors: ["Distribution may matter more than software speed for founders."],
    firstSeenAt: now,
    lastUpdatedAt: now,
    confidence: 0.85,
    importance: "high",
    suggestedThought:
      'The important part here is that the speaker says distribution may matter more than software speed for founders.',
    reasonSelected: "This stood out as a high-signal idea in the recent transcript.",
    status: "ready",
  };
}

test("multiple moments in cooldown produce one card when no card visible", () => {
  const runtime = initialListenCardRuntimeState();
  const d = decideListenCardSurface({
    runtime,
    moment: moment("m1"),
    hasVisibleListenCard: false,
  });
  assert.equal(d, "surface_new");
});

test("existing card prevents second card", () => {
  const runtime = { activeCardId: "card-1", activeMomentId: "m1", queuedMomentIds: [] };
  const second = moment("m2", "warning");
  second.transcriptAnchors = [
    "Cash runway under six months is a serious warning sign for early startups.",
  ];
  second.summary = second.transcriptAnchors[0]!;
  second.suggestedThought =
    "The speaker is warning that cash runway under six months is a serious warning sign for early startups.";
  second.reasonSelected = "The speaker flagged a caution worth noting before the video moves on.";
  const d = decideListenCardSurface({
    runtime,
    moment: second,
    hasVisibleListenCard: true,
    activeMoment: moment("m1"),
  });
  assert.equal(d, "save_silently");
});

test("stronger related moment updates existing card", () => {
  const runtime = { activeCardId: "card-1", activeMomentId: "m1", queuedMomentIds: [] };
  const related = moment("m1-updated", "key_idea");
  const d = decideListenCardSurface({
    runtime,
    moment: related,
    hasVisibleListenCard: true,
    activeMoment: moment("m1"),
  });
  assert.equal(d, "update_existing");
});

test("unrelated moment while card open is saved silently", () => {
  const runtime = { activeCardId: "card-1", activeMomentId: "m1", queuedMomentIds: [] };
  const unrelated = moment("m2", "sales_tactic");
  unrelated.transcriptAnchors = [
    "Objection handling requires discovery questions before you propose any solution.",
  ];
  unrelated.summary = unrelated.transcriptAnchors[0]!;
  unrelated.suggestedThought =
    "The speaker highlights a business angle about objection handling and discovery.";
  unrelated.reasonSelected = "Sales language often signals ideas worth revisiting in a report.";
  const d = decideListenCardSurface({
    runtime,
    moment: unrelated,
    hasVisibleListenCard: true,
    activeMoment: moment("m1"),
  });
  assert.equal(d, "save_silently");
});

test("Stop Everything clears active card and queue via clearListenCardRuntimeState", () => {
  const cleared = clearListenCardRuntimeState();
  assert.equal(cleared.activeCardId, undefined);
  assert.equal(cleared.activeMomentId, undefined);
  assert.deepEqual(cleared.queuedMomentIds, []);
});

test("applyListenCardSurface queues silent saves", () => {
  const runtime = initialListenCardRuntimeState();
  const next = applyListenCardSurface(runtime, "save_silently", "card-x", "m9");
  assert.deepEqual(next.queuedMomentIds, ["m9"]);
});

test("filterFeedToSingleListenCard keeps only one listen response", () => {
  const feed = filterFeedToSingleListenCard([
    { kind: "response", listenMomentId: "a" },
    { kind: "command", listenMomentId: undefined },
    { kind: "response", listenMomentId: "b" },
  ]);
  const listenCards = feed.filter((f) => f.listenMomentId);
  assert.equal(listenCards.length, 1);
  assert.equal(listenCards[0]?.listenMomentId, "b");
});
