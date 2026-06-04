import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOverlayCardEventKind,
  overlayCardFromEvent,
  OVERLAY_CARD_EVENT_KINDS,
} from "../shared/overlayCards.ts";

test("overlay card event kinds exclude lifecycle events", () => {
  assert.equal(isOverlayCardEventKind("screen_capture"), true);
  assert.equal(isOverlayCardEventKind("transcript_note"), true);
  assert.equal(isOverlayCardEventKind("session_started"), false);
  assert.equal(isOverlayCardEventKind("session_paused"), false);
  assert.equal(OVERLAY_CARD_EVENT_KINDS.size >= 6, true);
});

test("overlay card from event uses title and text", () => {
  const card = overlayCardFromEvent({
    id: "e1",
    sessionId: "s1",
    kind: "transcript_note",
    timestamp: new Date().toISOString(),
    title: "Transcript note",
    text: "Hello world",
  });
  assert.equal(card.id, "e1");
  assert.equal(card.title, "Transcript note");
  assert.equal(card.body, "Hello world");
});
