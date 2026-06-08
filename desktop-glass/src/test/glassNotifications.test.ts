import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickGlassNotification,
  shouldRaiseOverlayForNotifications,
} from "../shared/glassNotifications.ts";
import type { GlassCommandFeedItem } from "../shared/commandFeed.ts";
import { createCommandFeedItem } from "../shared/commandFeed.ts";

const feedItem = (id: string, kind: GlassCommandFeedItem["kind"] = "response"): GlassCommandFeedItem => ({
  id,
  kind,
  title: "IIVO",
  body: `Answer ${id}`,
  at: new Date().toISOString(),
});

test("pickGlassNotification prefers error over feed, toast, and notice", () => {
  const picked = pickGlassNotification({
    lastError: "Ask failed",
    lastNotice: "Setup check: ok",
    feedItems: [feedItem("1")],
    toastMessage: "Listening started",
  });
  assert.equal(picked?.source, "error");
  assert.equal(picked?.message, "Ask failed");
});

test("pickGlassNotification shows latest chat feed item and skips command rows", () => {
  const picked = pickGlassNotification({
    feedItems: [
      createCommandFeedItem("command", "What is this?", { prompt: "What is this?" }),
      createCommandFeedItem("thinking", "IIVO is thinking…", { prompt: "What is this?" }),
    ],
  });
  assert.equal(picked?.source, "feed");
  assert.equal(picked?.feedItem?.kind, "thinking");
  assert.equal(picked?.userPrompt, "What is this?");
});

test("pickGlassNotification shows latest feed item when no error", () => {
  const picked = pickGlassNotification({
    feedItems: [feedItem("1"), feedItem("2")],
    lastNotice: "Saved",
  });
  assert.equal(picked?.source, "feed");
  assert.equal(picked?.id, "feed-2");
});

test("pickGlassNotification shows toast before notice", () => {
  const picked = pickGlassNotification({
    feedItems: [],
    toastMessage: "Capturing screen…",
    lastNotice: "Setup check: ready",
  });
  assert.equal(picked?.source, "toast");
});

test("pickGlassNotification returns null when nothing to show", () => {
  assert.equal(pickGlassNotification({ feedItems: [] }), null);
});

test("shouldRaiseOverlayForNotifications raises when any source active", () => {
  assert.equal(
    shouldRaiseOverlayForNotifications({
      lastError: "fail",
      commandFeedLength: 0,
    }),
    true,
  );
  assert.equal(
    shouldRaiseOverlayForNotifications({
      commandFeedLength: 2,
    }),
    true,
  );
  assert.equal(
    shouldRaiseOverlayForNotifications({
      rendererNotificationActive: true,
      commandFeedLength: 0,
    }),
    true,
  );
});

test("shouldRaiseOverlayForNotifications does not raise when idle", () => {
  assert.equal(
    shouldRaiseOverlayForNotifications({
      commandFeedLength: 0,
    }),
    false,
  );
});
