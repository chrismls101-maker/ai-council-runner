import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countTypingIntelligenceWords,
  detectTypingIntelligenceInputType,
} from "../shared/glassTypingIntelligenceTypes.ts";

test("countTypingIntelligenceWords ignores extra whitespace", () => {
  assert.equal(countTypingIntelligenceWords("one two   three"), 3);
  assert.equal(countTypingIntelligenceWords(""), 0);
  assert.equal(countTypingIntelligenceWords("   "), 0);
});

test("detectTypingIntelligenceInputType classifies AI apps", () => {
  assert.equal(detectTypingIntelligenceInputType("Claude", "hello"), "ai_prompt");
  assert.equal(detectTypingIntelligenceInputType("ChatGPT", "hello"), "ai_prompt");
  assert.equal(detectTypingIntelligenceInputType("Perplexity", "hello"), "ai_prompt");
});

test("detectTypingIntelligenceInputType classifies email", () => {
  assert.equal(detectTypingIntelligenceInputType("Mail", "draft"), "email");
  assert.equal(detectTypingIntelligenceInputType("Mimestream", "draft"), "email");
  assert.equal(detectTypingIntelligenceInputType("Notes", "reach me at a@b.com"), "email");
});

test("detectTypingIntelligenceInputType classifies messaging apps", () => {
  assert.equal(detectTypingIntelligenceInputType("Slack", "ping"), "message");
  assert.equal(detectTypingIntelligenceInputType("Discord", "ping"), "message");
  assert.equal(detectTypingIntelligenceInputType("Messages", "ping"), "message");
});

test("detectTypingIntelligenceInputType defaults to general", () => {
  assert.equal(detectTypingIntelligenceInputType("Notes", "shopping list"), "general");
});
