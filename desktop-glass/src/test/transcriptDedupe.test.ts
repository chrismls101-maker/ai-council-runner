import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendTranscriptDeduped,
  collapseDuplicateTranscriptLines,
  dedupeTranscriptEventsForDisplay,
  isDuplicateTranscriptChunk,
  transcriptChunkKey,
} from "../shared/transcriptDedupe.ts";

test("same transcript chunk repeated 40 times only stores once via append", () => {
  const line = "Welcome to today's episode about distribution.";
  let transcript = "";
  for (let i = 0; i < 40; i++) {
    transcript = appendTranscriptDeduped(transcript, line);
  }
  assert.equal(transcript, line);
});

test("interim-style updates do not create duplicates in append", () => {
  let t = appendTranscriptDeduped("", "The speaker is explaining");
  t = appendTranscriptDeduped(t, "The speaker is explaining distribution");
  assert.match(t, /distribution/);
  assert.equal(t.split("The speaker is explaining").length - 1, 1);
});

test("final replaces interim when duplicate tail", () => {
  let t = appendTranscriptDeduped("", "Speed alone may not be enough");
  t = appendTranscriptDeduped(t, "Speed alone may not be enough for founders.");
  assert.equal(t, "Speed alone may not be enough for founders.");
});

test("system_audio transcript chunks from same source dedupe correctly", () => {
  const recent = [
    { text: "Distribution matters more than speed.", tags: ["system_audio"] },
  ];
  assert.equal(
    isDuplicateTranscriptChunk("Distribution matters more than speed.", "system_audio", recent),
    true,
  );
  assert.equal(
    isDuplicateTranscriptChunk("Trust and distribution are the real moat.", "system_audio", recent),
    false,
  );
});

test("different real chunks are still preserved in event dedupe", () => {
  const events = dedupeTranscriptEventsForDisplay([
    { text: "First real line.", tags: ["system_audio"] },
    { text: "First real line.", tags: ["system_audio"] },
    { text: "Second distinct line.", tags: ["system_audio"] },
  ]);
  assert.equal(events.length, 2);
  assert.equal(events[1]?.text, "Second distinct line.");
});

test("collapseDuplicateTranscriptLines removes consecutive repeats", () => {
  const raw = ["Line one", "Line one", "Line one", "Line two"].join("\n");
  assert.equal(collapseDuplicateTranscriptLines(raw), "Line one\nLine two");
});

test("transcriptChunkKey is stable for same source text and bucket", () => {
  const ms = 90_000;
  const a = transcriptChunkKey("Hello world", "system_audio", ms);
  const b = transcriptChunkKey("Hello world", "system_audio", ms + 1000);
  assert.equal(a, b);
});
