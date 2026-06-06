import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractMediaContext,
  answerClaimsFacialRecognition,
  answerClaimsFakeAudio,
} from "../shared/mediaContextExtract.ts";

test("extracts YouTube title from browser window title", () => {
  const ctx = extractMediaContext({
    appName: "Google Chrome",
    windowTitle: "$4 billion founder: the next three years will make 100 new founders rich - YouTube",
    browserUrl: "https://www.youtube.com/watch?v=abc123",
  });
  assert.ok(ctx);
  assert.equal(ctx!.sourceType, "youtube");
  assert.ok(ctx!.title?.includes("$4 billion founder"));
  assert.equal(ctx!.confidence, "high");
});

test("does not hardcode Silicon Valley Girl — only extracts if visible", () => {
  const without = extractMediaContext({
    windowTitle: "Some video - YouTube",
  });
  assert.ok(!without?.channelOrSource?.includes("Silicon Valley Girl"));
  const withChannel = extractMediaContext({
    visibleTextSummary: "Channel: Silicon Valley Girl\nVideo title: Founder advice",
    windowTitle: "Founder advice - YouTube",
  });
  assert.equal(withChannel?.channelOrSource, "Silicon Valley Girl");
});

test("flags facial recognition claims in answers", () => {
  assert.equal(
    answerClaimsFacialRecognition("I recognize this person from their face on screen."),
    true,
  );
  assert.equal(
    answerClaimsFacialRecognition("The channel name visible is Silicon Valley Girl."),
    false,
  );
});

test("flags fake audio claims when no transcript exists", () => {
  assert.equal(answerClaimsFakeAudio("I heard the speaker say pricing is hard.", false), true);
  assert.equal(answerClaimsFakeAudio("From the transcript, pricing was discussed.", true), false);
});

test("media context includes extraction notes when URL missing", () => {
  const ctx = extractMediaContext({ windowTitle: "Lesson 1 - YouTube" });
  assert.ok(ctx?.extractionNotes?.some((n) => /URL not available/i.test(n)));
});
