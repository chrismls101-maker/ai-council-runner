import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendCommandFeedItem,
  createCommandFeedItem,
  MAX_COMMAND_FEED_ITEMS,
  COMMAND_FEED_TITLES,
} from "../shared/commandFeed.ts";

test("createCommandFeedItem builds a typed, titled item", () => {
  const item = createCommandFeedItem("command", "What am I working on?");
  assert.equal(item.kind, "command");
  assert.equal(item.title, COMMAND_FEED_TITLES.command);
  assert.equal(item.body, "What am I working on?");
  assert.ok(item.id.length > 0);
  assert.ok(item.at.length > 0);
});

test("createCommandFeedItem allows a custom title + pinned flag", () => {
  const item = createCommandFeedItem("response", "Here is your answer", {
    title: "IIVO answered",
    pinned: true,
  });
  assert.equal(item.title, "IIVO answered");
  assert.equal(item.pinned, true);
});

test("response card events render as feed items per type", () => {
  for (const kind of ["command", "thinking", "response", "capture", "transcript", "error", "moment"] as const) {
    const item = createCommandFeedItem(kind, `body ${kind}`);
    assert.equal(item.kind, kind);
    assert.equal(item.title, COMMAND_FEED_TITLES[kind]);
  }
});

test("appendCommandFeedItem keeps newest and caps length", () => {
  let feed = createInitialFeed(0);
  for (let i = 0; i < MAX_COMMAND_FEED_ITEMS + 5; i += 1) {
    feed = appendCommandFeedItem(feed, createCommandFeedItem("response", `msg ${i}`));
  }
  assert.equal(feed.length, MAX_COMMAND_FEED_ITEMS);
  // last item is the most recent
  assert.equal(feed[feed.length - 1].body, `msg ${MAX_COMMAND_FEED_ITEMS + 4}`);
});

function createInitialFeed(n: number) {
  const feed = [];
  for (let i = 0; i < n; i += 1) feed.push(createCommandFeedItem("response", `seed ${i}`));
  return feed;
}
