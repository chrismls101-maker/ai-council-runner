import assert from "node:assert/strict";
import { test } from "node:test";
import {
  preflightCodeToServerResult,
  preflightFailure,
  VISUAL_PREFLIGHT_MESSAGES,
} from "../shared/visualAskPreflight.ts";

test("preflightFailure uses default messages", () => {
  const fail = preflightFailure("capture_permission");
  assert.equal(fail.ok, false);
  assert.equal(fail.message, VISUAL_PREFLIGHT_MESSAGES.capture_permission);
});

test("preflightCodeToServerResult maps codes for diagnostics", () => {
  assert.equal(preflightCodeToServerResult("capture_permission"), "capture_permission");
  assert.equal(preflightCodeToServerResult("vision_disabled"), "vision_unavailable");
  assert.equal(preflightCodeToServerResult("server_offline"), "network_error");
  assert.equal(preflightCodeToServerResult("payload_too_large"), "413");
});
