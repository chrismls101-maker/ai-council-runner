/**
 * Unit tests for build output monitoring (#162).
 *
 * Tests the pure logic in src/shared/terminalEvents.ts:
 *   - extractErrorFileRefs: parse file:line references from build output
 *   - parseTerminalOutput: already tested in terminalEvents.test.ts;
 *     here we focus on build-tool-specific patterns used by the monitor.
 *
 * Framework: node:test + node:assert/strict (no vitest)
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractErrorFileRefs, parseTerminalOutput } from "../shared/terminalEvents.ts";

// ── extractErrorFileRefs ──────────────────────────────────────────────────────

describe("extractErrorFileRefs", () => {
  test("extracts TypeScript file:line reference", () => {
    const output = "src/main/index.ts:42:5 - error TS2339: Property 'foo' does not exist";
    const refs = extractErrorFileRefs(output);
    assert(refs.includes("src/main/index.ts"), `expected src/main/index.ts in ${JSON.stringify(refs)}`);
  });

  test("extracts tsc parenthesised format: file(line,col)", () => {
    const output = "src/renderer/App.tsx(12,3): error TS2345: Argument of type 'string'";
    const refs = extractErrorFileRefs(output);
    assert(refs.includes("src/renderer/App.tsx"), `expected App.tsx in ${JSON.stringify(refs)}`);
  });

  test("extracts Rust error file reference", () => {
    const output = "error[E0308]: mismatched types\n  --> src/main.rs:17:14";
    const refs = extractErrorFileRefs(output);
    assert(refs.includes("src/main.rs"), `expected src/main.rs in ${JSON.stringify(refs)}`);
  });

  test("extracts Go error file reference", () => {
    const output = "./cmd/server.go:45:2: undefined: foo";
    const refs = extractErrorFileRefs(output);
    assert(refs.includes("./cmd/server.go"), `expected cmd/server.go in ${JSON.stringify(refs)}`);
  });

  test("extracts multiple distinct file refs, up to 5", () => {
    const output = [
      "src/a.ts:1:1 - error TS2345: bad",
      "src/b.ts:2:2 - error TS2339: also bad",
      "src/c.ts:3:3 - error TS2304: missing",
      "src/d.ts:4:4 - error TS7006: param",
      "src/e.ts:5:5 - error TS2551: prop",
      "src/f.ts:6:6 - error TS2551: prop",
    ].join("\n");
    const refs = extractErrorFileRefs(output);
    assert(refs.length <= 5, "should return at most 5 refs");
    assert(refs.length >= 5, "should return 5 refs for 6 distinct files");
  });

  test("deduplicates the same file appearing multiple times", () => {
    const output = [
      "src/foo.ts:10:1 - error TS2339: first error",
      "src/foo.ts:20:5 - error TS2345: second error",
    ].join("\n");
    const refs = extractErrorFileRefs(output);
    assert.equal(refs.filter((r) => r === "src/foo.ts").length, 1, "should deduplicate");
  });

  test("ignores non-source-file patterns", () => {
    const output = "npm run build\n> project@1.0.0 build\n> tsc";
    const refs = extractErrorFileRefs(output);
    // No .ts files in paths above (only bare commands)
    assert.equal(refs.length, 0, "should not extract non-file patterns");
  });

  test("returns empty array for output with no file refs", () => {
    const refs = extractErrorFileRefs("Error: ENOENT no such file or directory");
    assert.equal(refs.length, 0);
  });

  test("extracts .jsx and .tsx paths", () => {
    const output = "src/components/Button.tsx:5:10 - error TS2345: bad prop\nsrc/pages/Home.jsx:12:3: lint error";
    const refs = extractErrorFileRefs(output);
    assert(refs.some((r) => r.endsWith(".tsx")), "should extract .tsx");
    assert(refs.some((r) => r.endsWith(".jsx")), "should extract .jsx");
  });
});

// ── parseTerminalOutput — build monitor patterns ──────────────────────────────

describe("parseTerminalOutput (build monitor patterns)", () => {
  test("detects TypeScript error count summary: '3 errors'", () => {
    const output = "src/foo.ts:1:1 - error TS2339: bad\n\nFound 3 errors.\n";
    const events = parseTerminalOutput(output, { source: "Glass Terminal" });
    assert(events.length > 0, "should detect build error");
    assert.equal(events[0].type, "build_error");
  });

  test("detects 'error TS####' inline", () => {
    const output = "error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.";
    const events = parseTerminalOutput(output);
    assert(events.length > 0, "should detect TS error");
    assert.equal(events[0].type, "build_error");
  });

  test("detects npm ERR! as build error", () => {
    const output = "npm ERR! code ELIFECYCLE\nnpm ERR! errno 1\nnpm ERR! project@1.0.0 build: `tsc`";
    const events = parseTerminalOutput(output);
    assert(events.length > 0, "should detect npm ERR! as build error");
    assert.equal(events[0].type, "build_error");
  });

  test("does NOT fire for clean build output", () => {
    const output = "$ tsc\n> Done in 1.23s";
    const events = parseTerminalOutput(output);
    assert.equal(events.length, 0, "clean build should produce no events");
  });

  test("deduplication: same fingerprint within 60s returns no events", () => {
    const output = "error TS2339: Property 'foo' does not exist on type 'Bar'.";
    const first = parseTerminalOutput(output);
    assert.equal(first.length, 1, "first occurrence should fire");
    const second = parseTerminalOutput(output, { existingEvents: first });
    assert.equal(second.length, 0, "duplicate within window should be suppressed");
  });

  test("deduplication: same fingerprint outside 60s fires again", () => {
    const output = "error TS2339: Property 'foo' does not exist on type 'Bar'.";
    const oldEvent = parseTerminalOutput(output, { timestamp: Date.now() - 61_000 })[0];
    assert(oldEvent, "should produce an old event");
    // Feed the old event as existing; it's outside the 60s window
    const second = parseTerminalOutput(output, {
      existingEvents: [{ ...oldEvent, timestamp: Date.now() - 61_000 }],
    });
    assert.equal(second.length, 1, "should fire again after dedup window");
  });
});
