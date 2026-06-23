/**
 * Unit tests for OSC 7 cwd extraction.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractOsc7Cwd } from "../renderer/dock/terminalOscParse.ts";

describe("extractOsc7Cwd", () => {
  test("returns decoded path from OSC 7 BEL terminator", () => {
    const chunk = `\x1b]7;file://host/Users/me/proj\x07`;
    assert.equal(extractOsc7Cwd(chunk), "/Users/me/proj");
  });

  test("returns last path when multiple OSC 7 sequences appear", () => {
    const chunk =
      `\x1b]7;file://host/Users/me/a\x07` +
      `\x1b]7;file://host/Users/me/b\x07`;
    assert.equal(extractOsc7Cwd(chunk), "/Users/me/b");
  });

  test("returns null when no OSC 7 present", () => {
    assert.equal(extractOsc7Cwd("plain output\n"), null);
  });
});
