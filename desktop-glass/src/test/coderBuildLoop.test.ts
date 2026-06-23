import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../shared/config.ts";
import { DEFAULT_GLASS_USER_SETTINGS } from "../shared/glassSettings.ts";
import type { GlassUserSettings } from "../shared/glassSettings.ts";
import {
  buildReviewFixPrompt,
  buildVerifyFixPrompt,
  canStartLoopFix,
  CODER_LOOP_MAX_ITERATIONS,
  incrementLoopForFix,
  reviewLooksClean,
  verifyFailLabel,
  verifyPassLabel,
  verifyPassNarration,
  verifyRunningLabel,
} from "../shared/coderBuildLoopShared.ts";
import type { CoderBuildLoopHost } from "../shared/coderBuildLoopHost.ts";

function mockHost(iteration?: number): CoderBuildLoopHost {
  let loopIteration = iteration;
  return {
    getSettings: (): GlassUserSettings => DEFAULT_GLASS_USER_SETTINGS,
    getChangeLog: () => [],
    getVerifyState: () => null,
    setVerifyState: () => {},
    getReviewState: () => null,
    setReviewState: () => {},
    setProjectMemoryState: () => {},
    setLastNotice: () => {},
    push: () => {},
    broadcastOpenCoder: () => {},
    getConfig: () => DEFAULT_CONFIG,
    isAgentActive: () => false,
    getLoopIteration: () => loopIteration,
    setLoopIteration: (n) => { loopIteration = n; },
    isCoderRunCurrent: () => true,
  };
}

test("buildVerifyFixPrompt includes error output", () => {
  const prompt = buildVerifyFixPrompt("error TS2304: Cannot find name 'foo'");
  assert.match(prompt, /error TS2304/);
  assert.match(prompt, /Fix all errors/);
});

test("buildReviewFixPrompt includes findings", () => {
  const prompt = buildReviewFixPrompt("Missing null check in handler.ts");
  assert.match(prompt, /Missing null check/);
});

test("reviewLooksClean detects clean reviews", () => {
  assert.equal(reviewLooksClean("This looks good — no issues found."), true);
  assert.equal(reviewLooksClean("The code looks correct."), true);
  assert.equal(reviewLooksClean("Found a bug on line 42."), false);
  assert.equal(reviewLooksClean("This looks good, but there's a missing null check."), false);
  assert.equal(reviewLooksClean("Looks fine however you should add error handling."), false);
  assert.equal(reviewLooksClean("- handler.ts: missing null check\n- utils.ts: fix typo"), false);
});

test("loop cap blocks fix at max iterations", () => {
  const host = mockHost(CODER_LOOP_MAX_ITERATIONS);
  assert.equal(canStartLoopFix(host), false);
  const hostOk = mockHost(CODER_LOOP_MAX_ITERATIONS - 1);
  assert.equal(canStartLoopFix(hostOk), true);
});

test("incrementLoopForFix advances iteration", () => {
  const host = mockHost(1);
  assert.equal(incrementLoopForFix(host), 2);
  assert.equal(host.getLoopIteration(), 2);
});

test("verify labels reflect the command that ran", () => {
  assert.equal(verifyRunningLabel("npm run typecheck"), "Checking types…");
  assert.equal(verifyPassLabel("npm run typecheck"), "✓ TypeScript clean");
  assert.equal(verifyFailLabel("npm run typecheck"), "✗ Type errors found");

  assert.equal(verifyRunningLabel("npm run build"), "Running build…");
  assert.equal(verifyPassLabel("npm run build"), "✓ Build passed");
  assert.equal(verifyFailLabel("npm run build"), "✗ Build failed");

  assert.equal(verifyPassNarration("npx tsc --noEmit"), "TypeScript clean.");
  assert.equal(verifyPassNarration("npm run build"), "Build passed.");
});
