import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAletheiaGlassProductContext,
  promptRequestsGlassProductContext,
  shouldInjectGlassProductKnowledge,
} from "../shared/glassAletheiaProductKnowledge.ts";

test("product map reflects Aletheia core session modes", () => {
  const ctx = buildAletheiaGlassProductContext(true)!;
  assert.match(ctx, /Intelligent Listening/);
  assert.match(ctx, /Meeting Intelligence/);
  assert.match(ctx, /Not available in this build/);
  assert.match(ctx, /Wingman mode/);
});

test("product map lists stripped surfaces as unavailable", () => {
  const ctx = buildAletheiaGlassProductContext(true)!;
  assert.match(ctx, /Glass IDE/);
  assert.match(ctx, /built-in terminal/);
  assert.match(ctx, /Wingman mode/);
  assert.match(ctx, /Glass Storage/);
});

test("promptRequestsGlassProductContext detects navigation questions", () => {
  assert.equal(promptRequestsGlassProductContext("where is setup in glass"), true);
  assert.equal(promptRequestsGlassProductContext("how do I start intelligent listening"), true);
  assert.equal(promptRequestsGlassProductContext("what is the capital of france"), false);
});

test("shouldInjectGlassProductKnowledge when companion is active", () => {
  assert.equal(
    shouldInjectGlassProductKnowledge({
      prompt: "summarize this paragraph",
      companionModeActive: true,
    }),
    true,
  );
  assert.equal(
    shouldInjectGlassProductKnowledge({
      prompt: "summarize this paragraph",
      companionModeActive: false,
    }),
    false,
  );
});

test("buildAletheiaGlassProductContext returns undefined when full strip", () => {
  assert.equal(buildAletheiaGlassProductContext(false), undefined);
});
