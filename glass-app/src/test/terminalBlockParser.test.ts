/**
 * Unit tests for OSC 133 + heuristic terminal block parsing.
 */

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createParserState,
  feedParserChunk,
  resetParserState,
  resetBlockIdSequence,
  osc133,
  type ParserState,
  type TerminalBlock,
} from "../renderer/dock/terminalBlockParser.ts";

function collectChunks(chunks: string[]): { state: ParserState; blocks: TerminalBlock[] } {
  const state = createParserState();
  const blocks: TerminalBlock[] = [];
  for (const chunk of chunks) {
    feedParserChunk(state, chunk, (b) => blocks.push(b));
  }
  return { state, blocks };
}

beforeEach(() => {
  resetBlockIdSequence();
});

describe("OSC 133 parser", () => {
  test("captures command and output across plain chunks after OSC mode locks in", () => {
    const { blocks } = collectChunks([
      osc133("A"),
      osc133("B"),
      "npm ",
      "run build",
      osc133("C"),
      "line1\n",
      "line2\n",
      osc133("D", 1),
    ]);

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].command, "npm run build");
    assert.match(blocks[0].output, /line1/);
    assert.match(blocks[0].output, /line2/);
    assert.equal(blocks[0].status, "error");
    assert.equal(blocks[0].exitCode, 1);
  });

  test("captures command text between B and C in the same chunk", () => {
    const { blocks } = collectChunks([
      osc133("A"),
      `${osc133("B")}ls -la${osc133("C")}`,
      "total 0\n",
      osc133("D", 0),
    ]);

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].command, "ls -la");
    assert.match(blocks[0].output, /total 0/);
    assert.equal(blocks[0].status, "success");
  });

  test("plain output chunks accumulate without OSC markers", () => {
    const state = createParserState();
    const blocks: TerminalBlock[] = [];
    const push = (b: TerminalBlock) => blocks.push(b);

    feedParserChunk(state, osc133("A"), push);
    feedParserChunk(state, osc133("B"), push);
    feedParserChunk(state, "echo hi", push);
    feedParserChunk(state, osc133("C"), push);
    feedParserChunk(state, "hello\n", push);
    feedParserChunk(state, "world\n", push);
    feedParserChunk(state, osc133("D", 0), push);

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].command, "echo hi");
    assert.equal(blocks[0].output, "hello\nworld");
  });
});

describe("heuristic parser", () => {
  test("detects zsh-style prompt and command on separate lines", () => {
    const { blocks } = collectChunks([
      "user@host dir % \n",
      "echo test\n",
      "test\n",
      "user@host dir % \n",
    ]);

    assert.ok(blocks.length >= 1);
    assert.equal(blocks[0].command, "echo test");
    assert.match(blocks[0].output, /test/);
  });
});

describe("resetParserState", () => {
  test("clears OSC mode so heuristic can run again", () => {
    const state = createParserState();
    const blocks: TerminalBlock[] = [];
    feedParserChunk(state, osc133("A"), (b) => blocks.push(b));
    assert.equal(state.useOsc133, true);
    resetParserState(state);
    assert.equal(state.useOsc133, null);
    assert.equal(state.mode, "idle");
  });
});
