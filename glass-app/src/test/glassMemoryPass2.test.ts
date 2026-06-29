import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryRetrievalStatusLine } from "../shared/glassMemory.ts";
import { buildSystemPrompt } from "../main/glassSystemPrompt.ts";

test("memoryRetrievalStatusLine describes fts fallback", () => {
  assert.match(memoryRetrievalStatusLine("fts_fallback") ?? "", /keyword fallback/i);
  assert.equal(memoryRetrievalStatusLine("hybrid"), undefined);
  assert.equal(memoryRetrievalStatusLine("profile_only"), undefined);
});

test("buildSystemPrompt includes fts fallback transparency note", () => {
  const prompt = buildSystemPrompt("Base prompt.", {
    userProfile: "- Name: Alex",
    relevantMemories: "Past project: Helios",
    tokenCount: 20,
    retrievalMode: "fts_fallback",
  });
  assert.match(prompt, /keyword search/i);
  assert.match(prompt, /Helios/);
});
