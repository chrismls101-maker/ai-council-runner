import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOpenCoderBroadcastAutoRun } from "../shared/ipc.ts";
import {
  FORCED_CODER_MISSING_WORKSPACE_TOAST,
  recordForcedCoderLaunch,
  resetForcedCoderLaunchDedupeForTests,
  shouldSkipDuplicateForcedCoderLaunch,
} from "../main/openCoderLaunchDedupe.ts";

test("resolveOpenCoderBroadcastAutoRun requires high confidence by default", () => {
  assert.equal(resolveOpenCoderBroadcastAutoRun(true, undefined, "high"), true);
  assert.equal(resolveOpenCoderBroadcastAutoRun(true, undefined, "low"), false);
  assert.equal(resolveOpenCoderBroadcastAutoRun(false, undefined, "high"), false);
});

test("resolveOpenCoderBroadcastAutoRun bypasses confidence when forceAutoRun is set", () => {
  assert.equal(resolveOpenCoderBroadcastAutoRun(true, true, "low"), true);
  assert.equal(resolveOpenCoderBroadcastAutoRun(true, true, undefined), true);
  assert.equal(resolveOpenCoderBroadcastAutoRun(false, true, "high"), false);
});

test("shouldSkipDuplicateForcedCoderLaunch when prior launch had workspace", () => {
  resetForcedCoderLaunchDedupeForTests();
  const prompt = "Build a todo app";
  const t0 = 1_000_000;
  assert.equal(shouldSkipDuplicateForcedCoderLaunch(prompt, true, false, t0), false);
  recordForcedCoderLaunch(prompt, true, true, t0);
  assert.equal(shouldSkipDuplicateForcedCoderLaunch(prompt, true, false, t0 + 5_000), true);
  assert.equal(shouldSkipDuplicateForcedCoderLaunch(prompt, true, false, t0 + 31_000), false);
  resetForcedCoderLaunchDedupeForTests();
});

test("no-workspace launch does not block retry until workspace exists", () => {
  resetForcedCoderLaunchDedupeForTests();
  const t0 = 2_000_000;
  recordForcedCoderLaunch("Build X", true, false, t0);
  assert.equal(shouldSkipDuplicateForcedCoderLaunch("Build X", true, false, t0 + 1_000), false);
  assert.equal(shouldSkipDuplicateForcedCoderLaunch("Build X", true, true, t0 + 1_000), true);
  resetForcedCoderLaunchDedupeForTests();
});

test("records no-workspace launches for later dedupe when workspace appears", () => {
  resetForcedCoderLaunchDedupeForTests();
  const t0 = 3_000_000;
  recordForcedCoderLaunch("Build Y", true, false, t0);
  recordForcedCoderLaunch("Build Y", true, true, t0 + 2_000);
  assert.equal(shouldSkipDuplicateForcedCoderLaunch("Build Y", true, true, t0 + 5_000), true);
  resetForcedCoderLaunchDedupeForTests();
});

test("FORCED_CODER_MISSING_WORKSPACE_TOAST is user-facing", () => {
  assert.match(FORCED_CODER_MISSING_WORKSPACE_TOAST, /project folder/i);
});
