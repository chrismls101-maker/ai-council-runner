import assert from "node:assert/strict";
import { test } from "node:test";
import { isGlassAskPayloadTooLargeError } from "../shared/glassAskClientUtils.ts";

test("isGlassAskPayloadTooLargeError detects 413 failures", () => {
  assert.equal(
    isGlassAskPayloadTooLargeError(new Error("IIVO ask failed (413): Payload Too Large")),
    true,
  );
  assert.equal(isGlassAskPayloadTooLargeError(new Error("IIVO ask failed (500): boom")), false);
});
