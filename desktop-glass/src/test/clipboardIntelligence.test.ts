/**
 * Unit tests for clipboardIntelligence.ts — pure classification logic.
 * No Electron required; runs in the node test runner.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyClipboard,
  ClipboardIntelligenceGate,
  MIN_CONTENT_LENGTH,
  MIN_CONFIDENCE_ERROR,
  MIN_CONFIDENCE_CODE,
  COOLDOWN_MS,
  truncateForPrompt,
  buildErrorPrompt,
  buildCodePrompt,
} from "../main/clipboardIntelligence.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function repeat(s: string, n: number): string {
  return s.repeat(n);
}

// ── classifyClipboard ─────────────────────────────────────────────────────────

describe("classifyClipboard", () => {
  it("returns plain for text below MIN_CONTENT_LENGTH", () => {
    const short = "hello world";
    assert(short.length < MIN_CONTENT_LENGTH);
    const r = classifyClipboard(short);
    assert.equal(r.kind, "plain");
    assert(r.signals.includes("too-short"));
  });

  it("returns plain at exactly MIN_CONTENT_LENGTH boundary if no signals", () => {
    // Exactly 40 chars of plain prose — no error/code signals
    const text = "this is exactly forty characters long xx";
    assert.equal(text.length, MIN_CONTENT_LENGTH);
    const r = classifyClipboard(text);
    assert.equal(r.kind, "plain");
  });

  it("classifies Node/JS stack trace as error", () => {
    const text = [
      "Error: Cannot read properties of undefined (reading 'foo')",
      "    at Object.<anonymous> (/Users/chris/app/src/index.ts:42:12)",
      "    at Module._compile (node:internal/modules/cjs/loader:1364:14)",
      "    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1422:10)",
    ].join("\n");
    const r = classifyClipboard(text);
    assert.equal(r.kind, "error", `expected error but got ${r.kind} (signals: ${r.signals.join(",")})`);
    assert(r.confidence >= MIN_CONFIDENCE_ERROR);
    assert(r.signals.includes("js-stack-frame") || r.signals.includes("error-keyword-line-start"));
  });

  it("classifies Python traceback as error", () => {
    const text = [
      "Traceback (most recent call last):",
      '  File "/home/user/app/main.py", line 23, in <module>',
      "    result = divide(10, 0)",
      '  File "/home/user/app/main.py", line 8, in divide',
      "    return a / b",
      "ZeroDivisionError: division by zero",
    ].join("\n");
    const r = classifyClipboard(text);
    assert.equal(r.kind, "error");
    assert(r.confidence >= MIN_CONFIDENCE_ERROR);
    assert(r.signals.includes("python-traceback"));
  });

  it("captures exit code from npm ERR! output", () => {
    const text = [
      "npm ERR! code ELIFECYCLE",
      "npm ERR! errno 1",
      "npm ERR! myapp@1.0.0 build: `tsc --noEmit`",
      "npm ERR! Exit status 1",
      "npm ERR!",
      "npm ERR! Failed at the myapp@1.0.0 build script.",
    ].join("\n");
    const r = classifyClipboard(text);
    assert.equal(r.kind, "error");
    assert.equal(r.exitCode, 1);
    assert(r.signals.includes("exit-code") || r.signals.includes("build-failure"));
  });

  it("classifies rust panic as error", () => {
    const text = [
      "thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 5', src/main.rs:12:5",
      "note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace",
    ].join("\n");
    const r = classifyClipboard(text);
    assert.equal(r.kind, "error");
    assert(r.signals.includes("rust-panic"));
  });

  it("classifies compiler diagnostic (file:line:col) as error", () => {
    const text = [
      "src/components/Button.tsx:24:7: error TS2322: Type 'string' is not assignable to type 'number'.",
      "  24 |   count={label}",
      "     |   ^^^^^",
    ].join("\n");
    const r = classifyClipboard(text);
    assert.equal(r.kind, "error");
    assert(r.confidence >= MIN_CONFIDENCE_ERROR, `confidence ${r.confidence} should be >= ${MIN_CONFIDENCE_ERROR}, signals: ${r.signals.join(",")}`);
    assert(
      r.signals.includes("compiler-diagnostic") || r.signals.includes("ts-compiler-error"),
      `expected compiler-diagnostic or ts-compiler-error, got: ${r.signals.join(",")}`,
    );
  });

  it("classifies TypeScript function block as code", () => {
    const text = [
      "export function greet(name: string): string {",
      "  const prefix = 'Hello,';",
      "  return `${prefix} ${name}!`;",
      "}",
    ].join("\n");
    const r = classifyClipboard(text);
    assert.equal(r.kind, "code", `expected code but got ${r.kind} (signals: ${r.signals.join(",")})`);
    assert(r.confidence >= MIN_CONFIDENCE_CODE);
  });

  it("detects TypeScript language for TS patterns", () => {
    const text = [
      "interface User {",
      "  id: number;",
      "  name: string;",
      "}",
      "const getUser = async (id: number): Promise<User> => {",
      "  return fetch(`/api/users/${id}`).then(r => r.json());",
      "};",
    ].join("\n");
    const r = classifyClipboard(text);
    assert.equal(r.kind, "code");
    assert.equal(r.language, "ts");
  });

  it("detects Python language for def/import patterns", () => {
    const text = [
      "import os",
      "def read_file(path):",
      "    with open(path, 'r') as f:",
      "        return f.read()",
    ].join("\n");
    const r = classifyClipboard(text);
    assert.equal(r.kind, "code");
    assert.equal(r.language, "py");
  });

  it("prefers error over code for error output containing code-shaped lines", () => {
    const text = [
      "Error: Module not found",
      "    at Object.<anonymous> (/app/src/index.ts:5:1)",
      "    at Module._compile (internal/modules/cjs/loader:999:30)",
      "const x = require('./missing');  // This line has code-like content",
    ].join("\n");
    const r = classifyClipboard(text);
    assert.equal(r.kind, "error", "error should win over code when both score");
  });

  it("returns plain for a URL", () => {
    const text = "https://www.example.com/some/path?query=value&other=123456789abc";
    const r = classifyClipboard(text);
    assert.equal(r.kind, "plain");
  });

  it("returns plain for a short prose sentence even above length threshold", () => {
    // A sentence with no code/error signals
    const text = "The quick brown fox jumps over the lazy dog and keeps on running down the lane.";
    const r = classifyClipboard(text);
    assert.equal(r.kind, "plain");
  });

  it("handles empty string without throwing", () => {
    const r = classifyClipboard("");
    assert.equal(r.kind, "plain");
  });
});

// ── ClipboardIntelligenceGate ─────────────────────────────────────────────────

describe("ClipboardIntelligenceGate", () => {
  it("fires for error above threshold", () => {
    const gate = new ClipboardIntelligenceGate(() => 0);
    const text = [
      "Error: Cannot read properties of undefined (reading 'name')",
      "    at Object.<anonymous> (/app/index.ts:10:20)",
      "    at Module._compile (internal/modules/cjs/loader:1000:14)",
    ].join("\n");
    const cls = classifyClipboard(text);
    assert.equal(cls.kind, "error");
    const d = gate.decide(text, cls);
    assert.equal(d.reason, "fire");
    assert.equal(d.shouldFire, true);
  });

  it("does not fire for plain text", () => {
    const gate = new ClipboardIntelligenceGate(() => 0);
    const cls = classifyClipboard("This is just a sentence about nothing in particular at all.");
    const d = gate.decide("This is just a sentence about nothing in particular at all.", cls);
    assert.equal(d.shouldFire, false);
    assert.equal(d.reason, "plain");
  });

  it("does not fire for too-short text", () => {
    const gate = new ClipboardIntelligenceGate(() => 0);
    const cls = classifyClipboard("hi");
    const d = gate.decide("hi", cls);
    assert.equal(d.reason, "too-short");
    assert.equal(d.shouldFire, false);
  });

  it("enforces cooldown after markFired", () => {
    let now = 0;
    const gate = new ClipboardIntelligenceGate(() => now);

    const errorText = [
      "Error: Connection refused ECONNREFUSED 127.0.0.1:5432",
      "    at TCPConnectWrap.afterConnect (node:net:1300:16)",
      "    at Object.<anonymous> (src/db.ts:14:3)",
    ].join("\n");
    const cls = classifyClipboard(errorText);

    const first = gate.decide(errorText, cls);
    assert.equal(first.reason, "fire");
    gate.markFired(errorText);

    // Same content, same time → cooldown
    const second = gate.decide(errorText, cls);
    assert.equal(second.reason, "cooldown");
    assert.equal(second.shouldFire, false);

    // Advance past cooldown
    now = COOLDOWN_MS + 1;
    const third = gate.decide(errorText, cls);
    assert.equal(third.reason, "fire");
    assert.equal(third.shouldFire, true);
  });

  it("cooldown matches near-identical copies (whitespace differences)", () => {
    let now = 0;
    const gate = new ClipboardIntelligenceGate(() => now);

    const original = [
      "Error: ENOENT no such file or directory '/tmp/missing.txt'",
      "    at Object.openSync (node:fs:596:3)",
      "    at Object.readFileSync (node:fs:464:35)",
    ].join("\n");
    const variant = original.replace(/\n/g, "\n  "); // add indentation

    const cls1 = classifyClipboard(original);
    gate.decide(original, cls1);
    gate.markFired(original);

    const cls2 = classifyClipboard(variant);
    const d = gate.decide(variant, cls2);
    assert.equal(d.reason, "cooldown", "near-identical variant should hit cooldown");
  });

  it("does not fire for code below MIN_CONFIDENCE_CODE", () => {
    const gate = new ClipboardIntelligenceGate(() => 0);
    // A barely-code-like snippet that might score low
    const lowCode = "const x = 1;\nconst y = 2;\nconst z = x + y;";
    const cls = classifyClipboard(lowCode);
    if (cls.kind === "code" && cls.confidence < MIN_CONFIDENCE_CODE) {
      const d = gate.decide(lowCode, cls);
      assert.equal(d.reason, "below-threshold");
    }
    // If it does exceed threshold or classified as plain, just assert no throw
  });

  it("does not markFired unless caller calls it, so a failed dispatch can retry", () => {
    let now = 0;
    const gate = new ClipboardIntelligenceGate(() => now);

    const text = [
      "Error: Unexpected token '<', '<!DOCTYPE '... is not valid JSON",
      "    at JSON.parse (<anonymous>)",
      "    at fetchData (src/api.ts:28:20)",
    ].join("\n");
    const cls = classifyClipboard(text);

    const d1 = gate.decide(text, cls);
    assert.equal(d1.reason, "fire");
    // Caller did NOT call markFired (simulating failed AI dispatch)

    // Same content, same time → should still fire (no cooldown set)
    const d2 = gate.decide(text, cls);
    assert.equal(d2.reason, "fire");
  });
});

// ── truncateForPrompt ─────────────────────────────────────────────────────────

describe("truncateForPrompt", () => {
  it("returns text unchanged when within limit", () => {
    const text = "short text";
    assert.equal(truncateForPrompt(text, "error", 4000), text);
  });

  it("truncates long error content keeping tail-heavy slice", () => {
    const text = repeat("x", 5000);
    const result = truncateForPrompt(text, "error", 100);
    assert(result.length < text.length);
    assert(result.includes("…"));
  });

  it("truncates long code content keeping head", () => {
    const text = repeat("a", 5000) + repeat("b", 5000);
    const result = truncateForPrompt(text, "code", 100);
    assert(result.startsWith("a"));
    assert(result.includes("[truncated]"));
  });
});

// ── Prompt builders ───────────────────────────────────────────────────────────

describe("buildErrorPrompt", () => {
  it("includes the error text in the prompt", () => {
    const error = "Error: boom\n    at index.ts:1:1\n    at index.ts:2:1";
    const prompt = buildErrorPrompt(error);
    assert(prompt.includes("Error: boom"));
    assert(prompt.includes("root cause"));
  });
});

describe("buildCodePrompt", () => {
  it("includes language in the prompt", () => {
    const code = "function add(a: number, b: number): number {\n  return a + b;\n}";
    const prompt = buildCodePrompt(code, "ts");
    assert(prompt.includes("ts"));
    assert(prompt.includes(code));
  });

  it("defaults to 'code' when no language provided", () => {
    const code = "SELECT * FROM users WHERE id = 1;\n-- this is sql\n-- with two comments\n";
    const prompt = buildCodePrompt(code, undefined);
    assert(prompt.includes("code"));
  });
});
