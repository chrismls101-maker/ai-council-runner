import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeCaptureSource,
  windowContextForEvent,
  WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
  WINDOW_CONTEXT_PERMISSION_MESSAGE,
  type WindowContext,
} from "../shared/windowContextTypes.ts";

test("source context unavailable fallback", () => {
  const ctx: WindowContext = { status: "unavailable", reason: WINDOW_CONTEXT_UNAVAILABLE_MESSAGE };
  const mapped = windowContextForEvent(ctx);
  assert.equal(mapped.sourceApp, undefined);
  assert.equal(mapped.sourceTitle, undefined);
  assert.equal(mapped.metadata.windowContext.status, "unavailable");
});

test("manual source title works via event fields", () => {
  const ctx: WindowContext = { status: "unavailable" };
  const mapped = windowContextForEvent(ctx);
  const manualTitle = "My manual app";
  assert.equal(mapped.sourceTitle, undefined);
  const withManual = { ...mapped, sourceTitle: manualTitle };
  assert.equal(withManual.sourceTitle, manualTitle);
});

test("captured source name stored", () => {
  const ctx: WindowContext = { status: "unavailable" };
  const merged = mergeCaptureSource(ctx, "Entire screen");
  assert.equal(merged.sourceName, "Entire screen");
  assert.equal(merged.displayName, "Entire screen");
  assert.equal(merged.status, "available");
  const mapped = windowContextForEvent(merged);
  assert.equal(mapped.sourceTitle, "Entire screen");
});

test("active window context maps app and title", () => {
  const ctx: WindowContext = {
    status: "available",
    appName: "Cursor",
    windowTitle: "Panel.tsx",
    displayName: "Cursor — Panel.tsx",
  };
  const mapped = windowContextForEvent(ctx);
  assert.equal(mapped.sourceApp, "Cursor");
  assert.equal(mapped.sourceTitle, "Panel.tsx");
});

test("permission required does not claim detection works", () => {
  const ctx: WindowContext = {
    status: "permission_required",
    reason: WINDOW_CONTEXT_PERMISSION_MESSAGE,
  };
  const mapped = windowContextForEvent(ctx);
  assert.equal(mapped.sourceApp, undefined);
  assert.equal(mapped.metadata.windowContext.status, "permission_required");
});

test("no crash when permission unavailable", () => {
  const ctx: WindowContext = { status: "error", reason: "denied" };
  assert.doesNotThrow(() => windowContextForEvent(ctx));
  assert.equal(windowContextForEvent(ctx).metadata.windowContext.reason, "denied");
});
