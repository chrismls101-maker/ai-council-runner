/**
 * Unit tests for terminal AI context normalization.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTerminalContextBlocks } from "../main/terminalContext.ts";

describe("normalizeTerminalContextBlocks", () => {
  test("accepts valid blocks and caps lengths", () => {
    const long = "x".repeat(5000);
    const out = normalizeTerminalContextBlocks([
      { command: "ls", output: long, status: "success", exitCode: 0, durationMs: 100 },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].command, "ls");
    assert.equal(out[0].output.length, 2000);
    assert.equal(out[0].status, "success");
  });

  test("skips invalid entries", () => {
    const out = normalizeTerminalContextBlocks([
      { command: "", output: "x", status: "success" },
      { command: 42, output: "y", status: "error" },
      { command: "ok", output: "out", status: "bogus" },
    ] as unknown[]);
    assert.equal(out.length, 1);
    assert.equal(out[0].command, "ok");
    assert.equal(out[0].status, "unknown");
  });
});
