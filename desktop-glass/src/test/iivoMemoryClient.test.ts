import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGlassMemoryPayload,
  buildGlassMemoryTitle,
  saveResponseToMemoryVault,
} from "../shared/iivoMemoryClient.ts";

test("buildGlassMemoryTitle prefers prompt", () => {
  assert.equal(buildGlassMemoryTitle("What is the capital of France?", "Paris."), "What is the capital of France?");
});

test("buildGlassMemoryTitle truncates long prompts", () => {
  const long = "a".repeat(100);
  const title = buildGlassMemoryTitle(long, "answer");
  assert.equal(title.length, 80);
  assert.ok(title.endsWith("…"));
});

test("buildGlassMemoryTitle falls back to first line of content", () => {
  assert.equal(buildGlassMemoryTitle(undefined, "First line\nSecond line"), "First line");
});

test("buildGlassMemoryPayload matches web evidence shape", () => {
  const payload = buildGlassMemoryPayload({
    content: "  Keep this answer  ",
    prompt: "Summarize Q3",
    runId: "run-42",
  });
  assert.deepEqual(payload, {
    type: "evidence",
    title: "Summarize Q3",
    content: "Keep this answer",
    sourceType: "glass",
    relatedRunId: "run-42",
  });
});

test("saveResponseToMemoryVault posts to /api/memory with auth headers", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ id: "mem-1", type: "evidence" }), { status: 201 });
  }) as typeof fetch;

  try {
    await saveResponseToMemoryVault({
      apiUrl: "https://api.test/",
      content: "Saved snippet",
      prompt: "Test prompt",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.test/api/memory");
    assert.equal(calls[0].init.method, "POST");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.type, "evidence");
    assert.equal(body.content, "Saved snippet");
    assert.equal(body.sourceType, "glass");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
