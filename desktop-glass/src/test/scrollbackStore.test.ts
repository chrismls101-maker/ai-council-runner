/**
 * Unit tests for scrollback write normalization and search ID parsing.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeScrollbackWriteBlocks,
  parseScrollbackSearchIds,
} from "../main/scrollbackValidation.ts";

describe("normalizeScrollbackWriteBlocks", () => {
  test("accepts valid blocks and rejects unknown session", () => {
    const out = normalizeScrollbackWriteBlocks([
      {
        sessionId: "term-1",
        command: "npm test",
        output: "ok",
        status: "success",
        startedAt: 1,
      },
      {
        sessionId: "unknown",
        command: "bad",
        output: "",
        status: "success",
        startedAt: 2,
      },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].sessionId, "term-1");
    assert.equal(out[0].command, "npm test");
  });

  test("caps command and output length", () => {
    const out = normalizeScrollbackWriteBlocks([
      {
        sessionId: "s1",
        command: "x".repeat(5000),
        output: "y".repeat(5000),
        status: "error",
        startedAt: 1,
      },
    ]);
    assert.equal(out[0].command.length, 4000);
    assert.equal(out[0].output.length, 2000);
  });
});

describe("parseScrollbackSearchIds", () => {
  test("accepts numbers and numeric strings", () => {
    assert.deepEqual(parseScrollbackSearchIds([42, "17", "bad", -1, 0]), [42, 17]);
  });
});
