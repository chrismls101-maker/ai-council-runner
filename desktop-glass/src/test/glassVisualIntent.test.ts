import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GLASS_VISUAL_FALLBACK_MAX_AGE_MS,
  isFallbackGlassCapture,
  promptRequestsGlassScreenVisual,
  promptRequestsGeneralGlassText,
  promptRequestsExplicitScreenVisual,
  resolveGlassAskUsesVisual,
  shouldCaptureScreenForGlassAsk,
} from "../shared/glassVisualIntent.ts";

test("explicit screen phrases trigger visual intent", () => {
  assert.equal(promptRequestsExplicitScreenVisual("What do you see on my screen?"), true);
  assert.equal(promptRequestsExplicitScreenVisual("Read this error"), true);
  assert.equal(promptRequestsExplicitScreenVisual("Look at this"), true);
  assert.equal(promptRequestsExplicitScreenVisual("What's on this page?"), true);
  assert.equal(promptRequestsExplicitScreenVisual("What does this screen say?"), true);
  assert.equal(promptRequestsExplicitScreenVisual("What am I looking at?"), true);
  assert.equal(promptRequestsGlassScreenVisual("What's on my screen?"), true);
});

test("general reasoning phrases stay text-first", () => {
  assert.equal(promptRequestsGeneralGlassText("What matters here?"), true);
  assert.equal(promptRequestsGeneralGlassText("What should I do next?"), true);
  assert.equal(promptRequestsGeneralGlassText("Summarize this"), true);
  assert.equal(promptRequestsGeneralGlassText("Turn this into action steps"), true);
  assert.equal(promptRequestsGeneralGlassText("What is the risk?"), true);
  assert.equal(promptRequestsGeneralGlassText("What did I miss?"), true);
  assert.equal(promptRequestsGlassScreenVisual("What matters here?"), false);
  assert.equal(promptRequestsGlassScreenVisual("What am I working on?"), false);
  assert.equal(promptRequestsGlassScreenVisual("Write a short reply."), false);
});

test("voice what matters here uses glass_direct unless explicit screen intent", () => {
  assert.equal(resolveGlassAskUsesVisual("What matters here?"), false);
  assert.equal(resolveGlassAskUsesVisual("What matters here?", { visualIntent: true }), true);
  assert.equal(shouldCaptureScreenForGlassAsk("What matters here?"), false);
  assert.equal(shouldCaptureScreenForGlassAsk("What matters here?", true), true);
});

test("voice read this error routes to visual capture", () => {
  assert.equal(shouldCaptureScreenForGlassAsk("Read this error"), true);
  assert.equal(resolveGlassAskUsesVisual("Read this error"), true);
});

test("ambiguous prompt with fresh screenshot may use visual without capture-first", () => {
  assert.equal(
    resolveGlassAskUsesVisual("Can you see the error here?", { hasInlineScreenshot: true }),
    true,
  );
  assert.equal(
    resolveGlassAskUsesVisual("What matters here?", { hasInlineScreenshot: true }),
    false,
  );
});

test("isFallbackGlassCapture uses 60 second window", () => {
  const recent = new Date(Date.now() - 30_000).toISOString();
  const stale = new Date(Date.now() - GLASS_VISUAL_FALLBACK_MAX_AGE_MS - 1000).toISOString();
  assert.equal(isFallbackGlassCapture(recent), true);
  assert.equal(isFallbackGlassCapture(stale), false);
});
