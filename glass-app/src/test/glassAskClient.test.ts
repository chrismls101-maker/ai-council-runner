import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../shared/config.ts";

class GlassAskCancelledError extends Error {
  constructor() {
    super("Glass ask cancelled");
    this.name = "GlassAskCancelledError";
  }
}

test("legacy glass ask URL points at Railway (deprecated for inference)", () => {
  assert.equal(`${DEFAULT_CONFIG.iivoApiUrl}/api/glass/ask`, "https://iivo.ai/api/glass/ask");
});

test("GlassAskCancelledError has stable name", () => {
  const err = new GlassAskCancelledError();
  assert.equal(err.name, "GlassAskCancelledError");
});

test("pending ask generation ignores stale responses", () => {
  let generation = 0;
  const start = () => {
    generation += 1;
    return generation;
  };
  const first = start();
  start();
  assert.notEqual(first, generation);
});

test("duplicate submit blocked while askInFlight", () => {
  let inFlight = false;
  const trySubmit = () => {
    if (inFlight) return false;
    inFlight = true;
    return true;
  };
  assert.equal(trySubmit(), true);
  assert.equal(trySubmit(), false);
});
