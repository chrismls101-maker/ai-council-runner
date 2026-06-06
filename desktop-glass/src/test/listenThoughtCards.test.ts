import { test } from "node:test";
import assert from "node:assert/strict";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";
import {
  buildListenThoughtFeedContent,
  listenCardTextIsVague,
} from "../shared/listenThoughtCards.ts";

function sampleMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const now = new Date().toISOString();
  return {
    id: "m1",
    type: "key_idea",
    summary: "Distribution may matter more than software speed.",
    transcriptAnchors: ["Distribution may matter more than software speed for founders."],
    firstSeenAt: now,
    lastUpdatedAt: now,
    confidence: 0.85,
    importance: "high",
    suggestedThought: "The speaker argues distribution may matter more than software speed.",
    reasonSelected: "High-signal founder insight.",
    status: "ready",
    ...overrides,
  };
}

test("proactive card has specific context text", () => {
  const feed = buildListenThoughtFeedContent(sampleMoment());
  assert.match(feed.contextLine, /From the video:/);
  assert.match(feed.body, /distribution/i);
  assert.ok(feed.fullBody.length > feed.body.length);
});

test("card never uses naked vague this prompts", () => {
  assert.equal(listenCardTextIsVague("Create a prompt from this?"), true);
  assert.equal(listenCardTextIsVague("Turn this into action?"), true);
  const feed = buildListenThoughtFeedContent(sampleMoment());
  assert.equal(listenCardTextIsVague(`${feed.title} ${feed.body}`), false);
});

test("expanded card shows full text", () => {
  const feed = buildListenThoughtFeedContent(sampleMoment());
  assert.match(feed.fullBody, /Why it matters:/);
  assert.match(feed.fullBody, /Saved automatically/);
});
