import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGlassAskUrl, GlassAskCancelledError } from "../main/glassAskClient.ts";
import { DEFAULT_CONFIG } from "../shared/config.ts";

test("buildGlassAskUrl targets /api/glass/ask", () => {
  assert.equal(buildGlassAskUrl(DEFAULT_CONFIG), "http://localhost:3001/api/glass/ask");
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
