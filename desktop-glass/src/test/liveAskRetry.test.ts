import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isNonRetryableLiveAskFailure,
  isTransientLiveAskError,
  shouldRetryLiveAsk,
} from "../../scripts/lib/glass-live-ask-retry.mjs";

test("timeout errors are transient and retried once", () => {
  const err = new Error("The operation was aborted due to timeout");
  assert.equal(isTransientLiveAskError(err), true);
  assert.equal(shouldRetryLiveAsk(err, 0, 0), true);
  assert.equal(shouldRetryLiveAsk(err, 0, 1), false);
});

test("recovered timeout is not a non-retryable failure", () => {
  const err = new Error("network reset");
  assert.equal(isNonRetryableLiveAskFailure(err), false);
  assert.equal(shouldRetryLiveAsk(err, 503, 0), true);
});

test("quality failures are not retried", () => {
  const err = new Error("Stub canary");
  assert.equal(isNonRetryableLiveAskFailure(err), true);
  assert.equal(shouldRetryLiveAsk(err, 0, 0), false);
});

test("second timeout remains failure (no third attempt)", () => {
  const err = new Error("timed out");
  assert.equal(shouldRetryLiveAsk(err, 0, 1), false);
});
