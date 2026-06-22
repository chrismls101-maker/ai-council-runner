/**
 * Unit tests for Glass Command Palette fuzzy scoring.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { fuzzyMatch, scoreItem, buildSections } from "../shared/paletteScorer.ts";
import type { GlassCommandItem, PaletteQuery, PaletteSection } from "../shared/paletteTypes.ts";

const emptyContext: PaletteQuery["context"] = {
  clipboardText: "",
  activeApp: "",
  lastTerminalBlock: null,
  terminalOpen: false,
  activePtyId: null,
  extractModeActive: false,
  hasLastResult: false,
};

function commandItem(overrides: Partial<GlassCommandItem> = {}): GlassCommandItem {
  return {
    id: "command:test",
    type: "command",
    title: "Open Terminal",
    subtitle: "Launch shell",
    icon: "⬛",
    score: 0,
    commandId: "open-terminal",
    contextTags: ["always-top"],
    keywords: ["terminal", "shell"],
    useCount: 0,
    action: { kind: "open-terminal" },
    ...overrides,
  };
}

describe("fuzzyMatch", () => {
  test("prefix match scores 1.0", () => {
    assert.equal(fuzzyMatch("Open Terminal", "open"), 1.0);
  });

  test("subsequence match scores between 0.4 and 0.8", () => {
    const score = fuzzyMatch("Natural Language Shell", "nlsh");
    assert.ok(score >= 0.4 && score <= 0.8);
  });

  test("unrelated query scores 0", () => {
    assert.equal(fuzzyMatch("Open Terminal", "zzzzz"), 0);
  });
});

describe("scoreItem", () => {
  test("boosts terminal-error items when last block failed", () => {
    const item = commandItem({
      title: "Fix Last Terminal Error",
      contextTags: ["terminal-error"],
    });
    const withError = scoreItem(item, {
      query: "",
      context: {
        ...emptyContext,
        terminalOpen: true,
        lastTerminalBlock: {
          command: "npm test",
          output: "fail",
          exitCode: 1,
          status: "error",
        },
      },
    });
    const without = scoreItem(item, { query: "", context: emptyContext });
    assert.ok(withError > without);
  });
});

describe("buildSections", () => {
  test("filters zero-score items when query is non-empty", () => {
    const sections: PaletteSection[] = [
      {
        id: "commands",
        label: "Commands",
        items: [
          commandItem({ title: "Open Terminal" }),
          commandItem({ id: "command:spend", title: "Open Spend Tracker", commandId: "open-spend" }),
        ],
        maxVisible: 8,
        order: 1,
      },
    ];
    const built = buildSections(sections, { query: "open term", context: emptyContext });
    assert.equal(built.length, 1);
    assert.equal(built[0]!.items.length, 1);
    assert.equal(built[0]!.items[0]!.title, "Open Terminal");
  });
});
