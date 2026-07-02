import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildVisualAskRetentionStatus,
  shouldAutoUploadCapturesToContext,
  shouldDiscardEphemeralAfterAsk,
  shouldPersistVisualAskToSession,
} from "../shared/glassScreenshotRetention.ts";
import { DEFAULT_GLASS_USER_SETTINGS } from "../shared/glassSettings.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("shouldPersistVisualAskToSession respects setting and live session", () => {
  assert.equal(
    shouldPersistVisualAskToSession(DEFAULT_GLASS_USER_SETTINGS, true),
    true,
  );
  assert.equal(
    shouldPersistVisualAskToSession({ ...DEFAULT_GLASS_USER_SETTINGS, saveVisualAsksToSession: false }, true),
    false,
  );
  assert.equal(shouldPersistVisualAskToSession(DEFAULT_GLASS_USER_SETTINGS, false), false);
});

test("auto-upload is off by default", () => {
  assert.equal(shouldAutoUploadCapturesToContext(DEFAULT_GLASS_USER_SETTINGS), false);
  assert.equal(
    shouldAutoUploadCapturesToContext({
      ...DEFAULT_GLASS_USER_SETTINGS,
      autoUploadCapturesToContext: true,
    }),
    true,
  );
});

test("buildVisualAskRetentionStatus labels", () => {
  const notSaved = buildVisualAskRetentionStatus({
    usedForAnswer: true,
    savedToSession: false,
    uploadedToContext: false,
  });
  assert.match(notSaved.label, /Screen used/i);
  assert.match(notSaved.detail ?? "", /Not saved/i);

  const saved = buildVisualAskRetentionStatus({
    usedForAnswer: true,
    savedToSession: true,
    uploadedToContext: false,
  });
  assert.match(saved.detail ?? "", /Saved to session/i);

  const uploaded = buildVisualAskRetentionStatus({
    usedForAnswer: true,
    savedToSession: false,
    uploadedToContext: true,
  });
  assert.match(uploaded.detail ?? "", /Uploaded to Studio/i);
});

test("ephemeral discarded from pending buffer when not saved to session", () => {
  assert.equal(shouldDiscardEphemeralAfterAsk(DEFAULT_GLASS_USER_SETTINGS, false, false), true);
  assert.equal(shouldDiscardEphemeralAfterAsk(DEFAULT_GLASS_USER_SETTINGS, true, true), false);
});

test("submitCommand does not auto-upload visual ask to Context Bridge", () => {
  const mainSource = readFileSync(join(__dirname, "../main/index.ts"), "utf8");
  const block = mainSource.slice(
    mainSource.indexOf("async function submitCommand"),
    mainSource.indexOf("\nasync function handleCommand"),
  );
  assert.doesNotMatch(block, /beginVisualContextUpload/);
});

test("registerLatestGlassCapture gates Context Bridge on setting", () => {
  const mainSource = readFileSync(join(__dirname, "../main/index.ts"), "utf8");
  assert.match(mainSource, /shouldAutoUploadCapturesToContext/);
});

test("session persistence strips screenshotDataUrl from JSON", () => {
  const src = readFileSync(join(__dirname, "../main/sessionPersistence.ts"), "utf8");
  assert.match(src, /delete event\.screenshotDataUrl/);
});

test("visual ask passes imageDataUrl in ask payload not session JSON", () => {
  const mainSource = readFileSync(join(__dirname, "../main/index.ts"), "utf8");
  assert.match(mainSource, /latestScreenshot/);
  assert.match(mainSource, /visualIntent/);
});
