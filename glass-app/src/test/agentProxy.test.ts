/**
 * Unit tests for src/shared/agentProxy.ts
 *
 * Covers:
 *   - sanitizeHeaders
 *   - extractRequestSnippets
 *   - extractResponseSnippets
 *   - extractStreamingSnippets
 *   - buildAgentCallSummary
 *   - analyzeAgentScope
 *   - formatCallsForPrompt
 *   - shortModelName
 *   - formatCallTime
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeHeaders,
  extractRequestSnippets,
  extractResponseSnippets,
  extractStreamingSnippets,
  buildAgentCallSummary,
  analyzeAgentScope,
  formatCallsForPrompt,
  shortModelName,
  formatCallTime,
  SYSTEM_PROMPT_SNIPPET_LEN,
  USER_MESSAGE_SNIPPET_LEN,
  RESPONSE_SNIPPET_LEN,
  MAX_CALLS_IN_PROMPT,
  type AgentCallSummary,
} from "../shared/agentProxy.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCall(overrides: Partial<AgentCallSummary> = {}): AgentCallSummary {
  return {
    id: `call-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    model: "claude-sonnet-4-6",
    userMessageSnippet: "fix the failing auth test",
    responseSnippet: "I'll look at the test file.",
    hasToolUse: false,
    toolNames: [],
    wasStreaming: false,
    ...overrides,
  };
}

function makeSse(events: object[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}`).join("\n");
}

// ─── sanitizeHeaders ──────────────────────────────────────────────────────────

test("sanitizeHeaders removes x-api-key", () => {
  const result = sanitizeHeaders({ "x-api-key": "sk-secret", "content-type": "application/json" });
  assert.equal("x-api-key" in result, false);
  assert.equal(result["content-type"], "application/json");
});

test("sanitizeHeaders removes authorization", () => {
  const result = sanitizeHeaders({ authorization: "Bearer token123", accept: "*/*" });
  assert.equal("authorization" in result, false);
  assert.equal(result["accept"], "*/*");
});

test("sanitizeHeaders removes all known sensitive headers", () => {
  const input: Record<string, string> = {
    "x-api-key": "v1",
    "authorization": "v2",
    "x-auth-token": "v3",
    "api-key": "v4",
    "openai-api-key": "v5",
    "anthropic-api-key": "v6",
    "x-goog-api-key": "v7",
    "x-deepseek-api-key": "v8",
    "content-type": "application/json",
  };
  const result = sanitizeHeaders(input);
  const keys = Object.keys(result);
  assert.deepEqual(keys, ["content-type"]);
});

test("sanitizeHeaders is case-insensitive", () => {
  const result = sanitizeHeaders({ "X-API-Key": "secret", "Content-Type": "application/json" });
  assert.equal("X-API-Key" in result, false);
  assert.equal(result["Content-Type"], "application/json");
});

test("sanitizeHeaders does not mutate the input object", () => {
  const input = { "x-api-key": "secret", "accept": "*/*" };
  sanitizeHeaders(input);
  assert.equal(input["x-api-key"], "secret");
});

test("sanitizeHeaders returns empty object when all headers are sensitive", () => {
  const result = sanitizeHeaders({ "x-api-key": "s1", "authorization": "s2" });
  assert.deepEqual(result, {});
});

// ─── extractRequestSnippets ───────────────────────────────────────────────────

test("extractRequestSnippets extracts model and user message from basic request", () => {
  const body = {
    model: "claude-opus-4-5",
    messages: [{ role: "user", content: "write me a poem" }],
    stream: false,
  };
  const result = extractRequestSnippets(body);
  assert.equal(result.model, "claude-opus-4-5");
  assert.equal(result.userMessageSnippet, "write me a poem");
  assert.equal(result.wasStreaming, false);
  assert.equal(result.systemPromptSnippet, undefined);
});

test("extractRequestSnippets extracts system prompt snippet", () => {
  const body = {
    model: "claude-sonnet-4-6",
    system: "You are a helpful coding assistant.",
    messages: [{ role: "user", content: "hello" }],
  };
  const result = extractRequestSnippets(body);
  assert.equal(result.systemPromptSnippet, "You are a helpful coding assistant.");
});

test("extractRequestSnippets truncates long system prompt to SYSTEM_PROMPT_SNIPPET_LEN + ellipsis", () => {
  const longSystem = "x".repeat(SYSTEM_PROMPT_SNIPPET_LEN + 50);
  const body = {
    model: "claude-sonnet-4-6",
    system: longSystem,
    messages: [{ role: "user", content: "hi" }],
  };
  const result = extractRequestSnippets(body);
  assert.ok(result.systemPromptSnippet?.endsWith("…"));
  assert.equal(result.systemPromptSnippet?.length, SYSTEM_PROMPT_SNIPPET_LEN + 1);
});

test("extractRequestSnippets truncates long user message to USER_MESSAGE_SNIPPET_LEN + ellipsis", () => {
  const longMsg = "y".repeat(USER_MESSAGE_SNIPPET_LEN + 50);
  const body = {
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: longMsg }],
  };
  const result = extractRequestSnippets(body);
  assert.ok(result.userMessageSnippet.endsWith("…"));
  assert.equal(result.userMessageSnippet.length, USER_MESSAGE_SNIPPET_LEN + 1);
});

test("extractRequestSnippets picks the LAST user message in a multi-turn conversation", () => {
  const body = {
    model: "claude-sonnet-4-6",
    messages: [
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second question — the one we want" },
    ],
  };
  const result = extractRequestSnippets(body);
  assert.equal(result.userMessageSnippet, "second question — the one we want");
});

test("extractRequestSnippets handles content block array (text blocks only)", () => {
  const body = {
    model: "claude-sonnet-4-6",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "look at this" },
          { type: "tool_result", tool_use_id: "x", content: "secret data" },
        ],
      },
    ],
  };
  const result = extractRequestSnippets(body);
  assert.equal(result.userMessageSnippet, "look at this");
});

test("extractRequestSnippets detects streaming=true", () => {
  const body = {
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: "hi" }],
    stream: true,
  };
  const result = extractRequestSnippets(body);
  assert.equal(result.wasStreaming, true);
});

test("extractRequestSnippets returns safe defaults for non-object body", () => {
  const result = extractRequestSnippets("not an object");
  assert.equal(result.model, "unknown");
  assert.equal(result.wasStreaming, false);
  assert.ok(result.userMessageSnippet.length > 0);
});

test("extractRequestSnippets handles system as array of text blocks", () => {
  const body = {
    model: "claude-sonnet-4-6",
    system: [{ type: "text", text: "You are a code reviewer." }],
    messages: [{ role: "user", content: "review this" }],
  };
  const result = extractRequestSnippets(body);
  assert.equal(result.systemPromptSnippet, "You are a code reviewer.");
});

// ─── extractResponseSnippets ──────────────────────────────────────────────────

test("extractResponseSnippets extracts text from content blocks", () => {
  const body = {
    content: [{ type: "text", text: "Here is the answer." }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
  const result = extractResponseSnippets(body);
  assert.equal(result.responseSnippet, "Here is the answer.");
  assert.equal(result.inputTokens, 10);
  assert.equal(result.outputTokens, 5);
  assert.equal(result.hasToolUse, false);
  assert.deepEqual(result.toolNames, []);
});

test("extractResponseSnippets captures tool names but not tool inputs", () => {
  const body = {
    content: [
      { type: "tool_use", id: "t1", name: "read_file", input: { path: "/etc/passwd" } },
    ],
    usage: { input_tokens: 20, output_tokens: 3 },
  };
  const result = extractResponseSnippets(body);
  assert.equal(result.hasToolUse, true);
  assert.deepEqual(result.toolNames, ["read_file"]);
  // Input must NOT appear in snippet
  assert.ok(!result.responseSnippet.includes("/etc/passwd"));
});

test("extractResponseSnippets truncates long text to RESPONSE_SNIPPET_LEN + ellipsis", () => {
  const longText = "z".repeat(RESPONSE_SNIPPET_LEN + 100);
  const body = {
    content: [{ type: "text", text: longText }],
  };
  const result = extractResponseSnippets(body);
  assert.ok(result.responseSnippet.endsWith("…"));
  assert.equal(result.responseSnippet.length, RESPONSE_SNIPPET_LEN + 1);
});

test("extractResponseSnippets returns fallback for tool-only response (no text)", () => {
  const body = {
    content: [{ type: "tool_use", id: "t1", name: "bash", input: {} }],
  };
  const result = extractResponseSnippets(body);
  assert.ok(result.responseSnippet.includes("bash"));
  assert.equal(result.hasToolUse, true);
});

test("extractResponseSnippets returns safe defaults for non-object", () => {
  const result = extractResponseSnippets(null);
  assert.equal(result.hasToolUse, false);
  assert.deepEqual(result.toolNames, []);
  assert.ok(result.responseSnippet.length > 0);
});

test("extractResponseSnippets handles multiple tool use blocks — collects all names", () => {
  const body = {
    content: [
      { type: "tool_use", id: "t1", name: "read_file", input: {} },
      { type: "tool_use", id: "t2", name: "bash", input: {} },
    ],
  };
  const result = extractResponseSnippets(body);
  assert.deepEqual(result.toolNames, ["read_file", "bash"]);
});

// ─── extractStreamingSnippets ─────────────────────────────────────────────────

test("extractStreamingSnippets accumulates text_delta chunks", () => {
  const sse = makeSse([
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello " } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world" } },
  ]);
  const result = extractStreamingSnippets(sse);
  assert.equal(result.responseSnippet, "Hello world");
});

test("extractStreamingSnippets ignores input_json_delta (tool inputs)", () => {
  const sse = makeSse([
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"path":"/secrets"}' } },
  ]);
  const result = extractStreamingSnippets(sse);
  // Must not contain tool input content
  assert.ok(!result.responseSnippet.includes("/secrets"));
  assert.ok(!result.responseSnippet.includes("input_json_delta"));
});

test("extractStreamingSnippets captures tool name from content_block_start", () => {
  const sse = makeSse([
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t1", name: "list_files" } },
  ]);
  const result = extractStreamingSnippets(sse);
  assert.equal(result.hasToolUse, true);
  assert.deepEqual(result.toolNames, ["list_files"]);
});

test("extractStreamingSnippets truncates response at RESPONSE_SNIPPET_LEN", () => {
  const bigChunk = "a".repeat(RESPONSE_SNIPPET_LEN + 100);
  const sse = makeSse([
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: bigChunk } },
  ]);
  const result = extractStreamingSnippets(sse);
  assert.equal(result.responseSnippet.length, RESPONSE_SNIPPET_LEN + 1); // +1 for "…"
  assert.ok(result.responseSnippet.endsWith("…"));
});

test("extractStreamingSnippets extracts token counts from message_start and message_delta", () => {
  const sse = makeSse([
    { type: "message_start", message: { usage: { input_tokens: 42 } } },
    { type: "message_delta", usage: { output_tokens: 17 } },
  ]);
  const result = extractStreamingSnippets(sse);
  assert.equal(result.inputTokens, 42);
  assert.equal(result.outputTokens, 17);
});

test("extractStreamingSnippets skips malformed JSON lines without throwing", () => {
  const sse = "data: {invalid json}\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"ok\"}}";
  const result = extractStreamingSnippets(sse);
  assert.equal(result.responseSnippet, "ok");
});

test("extractStreamingSnippets returns fallback for empty SSE", () => {
  const result = extractStreamingSnippets("");
  assert.ok(result.responseSnippet.length > 0);
  assert.equal(result.hasToolUse, false);
});

// ─── buildAgentCallSummary ────────────────────────────────────────────────────

test("buildAgentCallSummary assembles all fields correctly", () => {
  const req = {
    model: "claude-sonnet-4-6",
    userMessageSnippet: "fix the test",
    systemPromptSnippet: "You are a coder",
    wasStreaming: false,
  };
  const res = {
    responseSnippet: "I see the issue.",
    inputTokens: 100,
    outputTokens: 50,
    hasToolUse: false,
    toolNames: [],
  };
  const summary = buildAgentCallSummary("call-1", 1000, req, res);
  assert.equal(summary.id, "call-1");
  assert.equal(summary.timestamp, 1000);
  assert.equal(summary.model, "claude-sonnet-4-6");
  assert.equal(summary.userMessageSnippet, "fix the test");
  assert.equal(summary.systemPromptSnippet, "You are a coder");
  assert.equal(summary.responseSnippet, "I see the issue.");
  assert.equal(summary.inputTokens, 100);
  assert.equal(summary.outputTokens, 50);
  assert.equal(summary.hasToolUse, false);
  assert.equal(summary.wasStreaming, false);
});

test("buildAgentCallSummary handles undefined systemPromptSnippet", () => {
  const req = {
    model: "claude-sonnet-4-6",
    userMessageSnippet: "hi",
    systemPromptSnippet: undefined,
    wasStreaming: true,
  };
  const res = { responseSnippet: "hello", hasToolUse: false, toolNames: [] };
  const summary = buildAgentCallSummary("call-2", 2000, req, res);
  assert.equal(summary.systemPromptSnippet, undefined);
  assert.equal(summary.wasStreaming, true);
});

// ─── analyzeAgentScope ────────────────────────────────────────────────────────

test("analyzeAgentScope returns unknown with no calls", () => {
  const result = analyzeAgentScope("debug auth test", []);
  assert.equal(result.scopeHint, "unknown");
});

test("analyzeAgentScope returns on-track when all calls match goal terms", () => {
  const calls = [
    makeCall({ userMessageSnippet: "look at the auth module", responseSnippet: "auth.ts looks fine" }),
    makeCall({ userMessageSnippet: "check the auth test file", responseSnippet: "test passes" }),
  ];
  const result = analyzeAgentScope("fix the failing auth test", calls);
  assert.equal(result.scopeHint, "on-track");
});

test("analyzeAgentScope returns significant-drift when most calls are unrelated", () => {
  const calls = [
    makeCall({ userMessageSnippet: "update the landing page CSS styles", responseSnippet: "updated colors" }),
    makeCall({ userMessageSnippet: "fix the footer layout on mobile", responseSnippet: "added media query" }),
    makeCall({ userMessageSnippet: "change the font to Inter", responseSnippet: "updated globals.css" }),
  ];
  const result = analyzeAgentScope("debug the payment webhook handler", calls);
  assert.equal(result.scopeHint, "significant-drift");
});

test("analyzeAgentScope returns possible-drift when ≤25% of calls are unrelated", () => {
  // 3 related, 1 unrelated → 25% drift = possible-drift boundary
  const calls = [
    makeCall({ userMessageSnippet: "debug the payment handler", responseSnippet: "webhook.ts" }),
    makeCall({ userMessageSnippet: "payment signature verification", responseSnippet: "looks correct" }),
    makeCall({ userMessageSnippet: "webhook endpoint test", responseSnippet: "test added" }),
    makeCall({ userMessageSnippet: "update the readme file", responseSnippet: "readme updated" }),
  ];
  const result = analyzeAgentScope("debug the payment webhook handler", calls);
  // 1 of 4 unrelated = 25% drift → possible-drift (border case: <= 0.25)
  assert.equal(result.scopeHint, "possible-drift");
});

test("analyzeAgentScope is case-insensitive in matching", () => {
  const calls = [
    makeCall({ userMessageSnippet: "AUTH module debugging", responseSnippet: "AUTH test" }),
  ];
  const result = analyzeAgentScope("Fix the AUTH test", calls);
  assert.equal(result.scopeHint, "on-track");
});

test("analyzeAgentScope returns unknown for very short/generic goal", () => {
  const calls = [makeCall()];
  // All terms will be stop words or too short
  const result = analyzeAgentScope("fix it", calls);
  assert.equal(result.scopeHint, "unknown");
});

test("analyzeAgentScope note mentions call count for on-track result", () => {
  const calls = [
    makeCall({ userMessageSnippet: "auth test debugging" }),
    makeCall({ userMessageSnippet: "check auth flow" }),
  ];
  const result = analyzeAgentScope("debug the auth test", calls);
  assert.equal(result.scopeHint, "on-track");
  assert.ok(result.scopeNote.includes("2"));
});

// ─── formatCallsForPrompt ─────────────────────────────────────────────────────

test("formatCallsForPrompt returns no-calls message for empty array", () => {
  const out = formatCallsForPrompt([]);
  assert.ok(out.includes("No agent API calls"));
});

test("formatCallsForPrompt includes model name and message snippets", () => {
  const calls = [
    makeCall({
      model: "claude-opus-4-5",
      userMessageSnippet: "find the bug in routes.ts",
      responseSnippet: "I see a null check missing.",
    }),
  ];
  const out = formatCallsForPrompt(calls);
  assert.ok(out.includes("claude-opus-4-5"));
  assert.ok(out.includes("find the bug in routes.ts"));
  assert.ok(out.includes("I see a null check missing."));
});

test("formatCallsForPrompt includes tool names when present", () => {
  const calls = [
    makeCall({ hasToolUse: true, toolNames: ["read_file", "bash"] }),
  ];
  const out = formatCallsForPrompt(calls);
  assert.ok(out.includes("read_file"));
  assert.ok(out.includes("bash"));
});

test("formatCallsForPrompt caps output at MAX_CALLS_IN_PROMPT calls", () => {
  const calls = Array.from({ length: MAX_CALLS_IN_PROMPT + 5 }, (_, i) =>
    makeCall({ userMessageSnippet: `call ${i}` }),
  );
  const out = formatCallsForPrompt(calls);
  // Should mention the overflow
  assert.ok(out.includes("more calls") || out.includes("and 5"));
  // Call MAX_CALLS_IN_PROMPT+1 should NOT appear by its index
  assert.ok(!out.includes(`call ${MAX_CALLS_IN_PROMPT}`));
});

test("formatCallsForPrompt includes token counts when available", () => {
  const calls = [
    makeCall({ inputTokens: 150, outputTokens: 75 }),
  ];
  const out = formatCallsForPrompt(calls);
  assert.ok(out.includes("150") && out.includes("75"));
});

test("formatCallsForPrompt includes system prompt snippet when present", () => {
  const calls = [
    makeCall({ systemPromptSnippet: "You are a code assistant." }),
  ];
  const out = formatCallsForPrompt(calls);
  assert.ok(out.includes("You are a code assistant."));
});

// ─── shortModelName ───────────────────────────────────────────────────────────

test("shortModelName shortens claude-opus-4-5 to 'opus 4'", () => {
  assert.equal(shortModelName("claude-opus-4-5"), "opus 4");
});

test("shortModelName shortens claude-sonnet-4-6 to 'sonnet 4'", () => {
  assert.equal(shortModelName("claude-sonnet-4-6"), "sonnet 4");
});

test("shortModelName shortens claude-haiku-4-5-20251001 to 'haiku 4'", () => {
  assert.equal(shortModelName("claude-haiku-4-5-20251001"), "haiku 4");
});

test("shortModelName truncates unknown model names", () => {
  const result = shortModelName("gpt-4-turbo-preview-2024");
  assert.ok(result.length <= 12);
});

// ─── formatCallTime ───────────────────────────────────────────────────────────

test("formatCallTime formats timestamp as HH:MM", () => {
  // Build a specific known time: 14:05
  const d = new Date();
  d.setHours(14, 5, 0, 0);
  const result = formatCallTime(d.getTime());
  assert.equal(result, "14:05");
});

test("formatCallTime pads single-digit hours and minutes", () => {
  const d = new Date();
  d.setHours(9, 3, 0, 0);
  const result = formatCallTime(d.getTime());
  assert.equal(result, "09:03");
});

test("formatCallTime output matches HH:MM pattern", () => {
  const result = formatCallTime(Date.now());
  assert.match(result, /^\d{2}:\d{2}$/);
});

// ─── Privacy contract enforcement ─────────────────────────────────────────────

test("extractResponseSnippets never exposes tool input content", () => {
  const secret = "SUPER_SECRET_TOKEN_abc123";
  const body = {
    content: [
      { type: "tool_use", id: "t1", name: "bash", input: { command: `echo ${secret}` } },
    ],
  };
  const result = extractResponseSnippets(body);
  assert.ok(!result.responseSnippet.includes(secret));
});

test("extractStreamingSnippets never exposes input_json_delta content", () => {
  const secret = "SECRET_ENV_VALUE";
  const sse = makeSse([
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: `{"key":"${secret}"}` } },
  ]);
  const result = extractStreamingSnippets(sse);
  assert.ok(!result.responseSnippet.includes(secret));
});
