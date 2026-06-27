import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIPBOARD_CONTEXT_SNIPPET_LEN,
  CLIPBOARD_PERCEPTION_MAX_LEN,
  normalizeClipboardCapture,
} from "../shared/clipboardPerception.ts";

test("normalizeClipboardCapture clears empty clipboard", () => {
  assert.deepEqual(normalizeClipboardCapture(""), { text: undefined, truncated: false });
  assert.deepEqual(normalizeClipboardCapture("   "), { text: undefined, truncated: false });
});

test("normalizeClipboardCapture keeps normal clipboard text", () => {
  const result = normalizeClipboardCapture("hello world");
  assert.equal(result.text, "hello world");
  assert.equal(result.truncated, false);
});

test("normalizeClipboardCapture truncates oversized clipboard instead of ignoring it", () => {
  const huge = "x".repeat(CLIPBOARD_PERCEPTION_MAX_LEN + 50);
  const result = normalizeClipboardCapture(huge);
  assert.equal(result.text?.length, CLIPBOARD_CONTEXT_SNIPPET_LEN);
  assert.equal(result.truncated, true);
});
