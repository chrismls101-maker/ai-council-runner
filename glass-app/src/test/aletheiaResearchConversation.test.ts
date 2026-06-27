import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyResearchConversationIntent,
  classifyResearchFollowUp,
  formatResearchSynthesisWithCitations,
  isResearchConversationActive,
  initialResearchConversationSnapshot,
  parseCitationsFromToolResult,
  researchIntroSpeech,
} from "../shared/aletheiaResearchConversation.ts";

test("classifyResearchConversationIntent matches web lookup phrasing", () => {
  const intent = classifyResearchConversationIntent("Look this up: EU AI Act enforcement timeline");
  assert.ok(intent);
  assert.equal(intent!.category, "general_lookup");
});

test("classifyResearchConversationIntent matches latest-news phrasing", () => {
  const intent = classifyResearchConversationIntent("Find the latest on OpenAI enterprise pricing");
  assert.ok(intent);
  assert.equal(intent!.category, "latest_news");
});

test("classifyResearchConversationIntent supports thread follow-ups", () => {
  const thread = {
    threadId: "t1",
    phase: "complete" as const,
    query: "Look up X",
    queryCategory: "general_lookup" as const,
    synthesis: "Found three sources.",
    citations: [{ index: 1, url: "https://example.com" }],
    priorQueries: ["Look up X"],
    startedAt: 1,
    updatedAt: 2,
  };
  const intent = classifyResearchConversationIntent("What about Europe specifically?", thread);
  assert.ok(intent);
  assert.equal(intent!.isFollowUp, true);
});

test("classifyResearchConversationIntent maps structured follow-up actions", () => {
  const thread = {
    threadId: "t1",
    phase: "complete" as const,
    query: "Look up X",
    queryCategory: "general_lookup" as const,
    synthesis: "Found three sources.",
    citations: [],
    priorQueries: ["Look up X"],
    startedAt: 1,
    updatedAt: 2,
  };
  const intent = classifyResearchConversationIntent("Summarize that", thread);
  assert.ok(intent);
  assert.equal(intent!.followUpAction, "summarize");
});

test("classifyResearchConversationIntent does not hijack unrelated companion chat", () => {
  const thread = {
    threadId: "t1",
    phase: "complete" as const,
    query: "Look up X",
    queryCategory: "general_lookup" as const,
    synthesis: "Found three sources.",
    citations: [],
    priorQueries: ["Look up X"],
    startedAt: 1,
    updatedAt: 2,
  };
  assert.equal(
    classifyResearchConversationIntent("Can you help me plan my afternoon schedule?", thread),
    null,
  );
});

test("classifyResearchFollowUp maps action phrases", () => {
  assert.equal(classifyResearchFollowUp("Summarize that"), "summarize");
  assert.equal(classifyResearchFollowUp("Compare deeper on the options"), "compare_deeper");
});

test("parseCitationsFromToolResult extracts numbered URLs", () => {
  const citations = parseCitationsFromToolResult("[1] https://a.example\n[2] https://b.example");
  assert.equal(citations.length, 2);
  assert.equal(citations[0]?.url, "https://a.example");
});

test("formatResearchSynthesisWithCitations appends sources block", () => {
  const text = formatResearchSynthesisWithCitations("Summary body.", [
    { index: 1, url: "https://example.com" },
  ]);
  assert.match(text, /Sources:/);
  assert.match(text, /\[1\] https:\/\/example\.com/);
});

test("initialResearchConversationSnapshot preserves thread id across follow-ups", () => {
  const first = initialResearchConversationSnapshot(
    { query: "Look up X", category: "general_lookup", matched: "Look up X" },
    [],
    { threadId: "thread-1" },
  );
  assert.equal(first.threadId, "thread-1");
  const second = initialResearchConversationSnapshot(
    { query: "What about Europe?", category: "follow_up", matched: "What about Europe?" },
    ["Look up X"],
    { threadId: first.threadId },
  );
  assert.equal(second.threadId, "thread-1");
});

test("isResearchConversationActive tracks researching phase", () => {
  assert.equal(
    isResearchConversationActive({
      threadId: "t",
      phase: "researching",
      query: "q",
      queryCategory: "general_lookup",
      citations: [],
      priorQueries: [],
      startedAt: 1,
      updatedAt: 1,
    }),
    true,
  );
  assert.match(researchIntroSpeech(), /checking the web/i);
});
