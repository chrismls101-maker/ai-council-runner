/**
 * Tests for custom slash commands (#165).
 * Covers: validateCustomCommands, buildShellThenPromptText.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateCustomCommands,
  buildShellThenPromptText,
  DEFAULT_CUSTOM_ICON,
  CUSTOM_COMMANDS_FILENAME,
  CUSTOM_COMMANDS_DIR,
} from "../shared/customCommands.ts";

// ── validateCustomCommands ────────────────────────────────────────────────────

describe("validateCustomCommands", () => {
  // ── top-level shape ─────────────────────────────────────────────────────────

  it("rejects non-array input", () => {
    const { valid, errors } = validateCustomCommands({ name: "x" });
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("must be a JSON array")));
  });

  it("rejects null", () => {
    const { valid, errors } = validateCustomCommands(null);
    assert.equal(valid.length, 0);
    assert.equal(errors.length, 1);
  });

  it("rejects string", () => {
    const { valid } = validateCustomCommands("not-an-array");
    assert.equal(valid.length, 0);
  });

  it("accepts empty array", () => {
    const { valid, errors } = validateCustomCommands([]);
    assert.equal(valid.length, 0);
    assert.equal(errors.length, 0);
  });

  // ── name validation ─────────────────────────────────────────────────────────

  it("accepts valid lowercase-alphanumeric name", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "deploy", description: "Deploy it", action: { type: "shell", command: "npm run deploy" } },
    ]);
    assert.equal(errors.length, 0);
    assert.equal(valid[0].name, "deploy");
  });

  it("accepts names with hyphens", () => {
    const { valid } = validateCustomCommands([
      { name: "run-tests", description: "Run tests", action: { type: "shell", command: "npm test" } },
    ]);
    assert.equal(valid[0].name, "run-tests");
  });

  it("rejects name with uppercase letters", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "Deploy", description: "Deploy", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("Deploy")));
  });

  it("rejects name starting with a hyphen", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "-bad", description: "Bad", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.length > 0);
  });

  it("rejects name ending with a hyphen", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "bad-", description: "Bad", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.length > 0);
  });

  it("rejects name with spaces", () => {
    const { valid } = validateCustomCommands([
      { name: "my command", description: "Bad", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
  });

  it("rejects missing name", () => {
    const { valid, errors } = validateCustomCommands([
      { description: "No name", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes('"name" is required')));
  });

  it("rejects empty name string", () => {
    const { valid } = validateCustomCommands([
      { name: "", description: "Empty", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
  });

  it("rejects name too long", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "a".repeat(41), description: "Long", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("name too long")));
  });

  it("deduplicates commands with same name", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "deploy", description: "First", action: { type: "shell", command: "cmd1" } },
      { name: "deploy", description: "Dup", action: { type: "shell", command: "cmd2" } },
    ]);
    assert.equal(valid.length, 1);
    assert.equal(valid[0].description, "First");
    assert.ok(errors.some((e) => e.includes("duplicate")));
  });

  // ── description validation ──────────────────────────────────────────────────

  it("rejects missing description", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes('"description" is required')));
  });

  it("rejects description too long", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "d".repeat(121), action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("description too long")));
  });

  // ── icon validation ─────────────────────────────────────────────────────────

  it("accepts command without icon (uses default at runtime)", () => {
    const { valid } = validateCustomCommands([
      { name: "x", description: "No icon", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid[0].icon, undefined);
  });

  it("accepts command with icon string", () => {
    const { valid } = validateCustomCommands([
      { name: "x", description: "Has icon", icon: "⚡", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid[0].icon, "⚡");
  });

  it("rejects non-string icon", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "Bad icon", icon: 123, action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes('"icon" must be a string')));
  });

  it("rejects empty string icon", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "Empty icon", icon: "", action: { type: "shell", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("empty string")));
  });

  // ── action: shell ───────────────────────────────────────────────────────────

  it("accepts shell action", () => {
    const { valid } = validateCustomCommands([
      { name: "build", description: "Build it", action: { type: "shell", command: "npm run build" } },
    ]);
    assert.equal(valid.length, 1);
    assert.equal(valid[0].action.type, "shell");
    if (valid[0].action.type === "shell") {
      assert.equal(valid[0].action.command, "npm run build");
    }
  });

  it("trims whitespace from shell command", () => {
    const { valid } = validateCustomCommands([
      { name: "x", description: "X", action: { type: "shell", command: "  npm test  " } },
    ]);
    if (valid[0].action.type === "shell") {
      assert.equal(valid[0].action.command, "npm test");
    }
  });

  it("rejects shell action with empty command", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "X", action: { type: "shell", command: "   " } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("non-empty")));
  });

  it("rejects shell action with command too long", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "X", action: { type: "shell", command: "x".repeat(2001) } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("command too long")));
  });

  // ── action: prompt ──────────────────────────────────────────────────────────

  it("accepts prompt action", () => {
    const { valid } = validateCustomCommands([
      { name: "review", description: "Review code", action: { type: "prompt", text: "Review this code." } },
    ]);
    assert.equal(valid[0].action.type, "prompt");
    if (valid[0].action.type === "prompt") {
      assert.equal(valid[0].action.text, "Review this code.");
    }
  });

  it("rejects prompt action with empty text", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "X", action: { type: "prompt", text: "" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("non-empty")));
  });

  it("rejects prompt text too long", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "X", action: { type: "prompt", text: "t".repeat(4001) } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("prompt text too long")));
  });

  // ── action: shell-then-prompt ───────────────────────────────────────────────

  it("accepts shell-then-prompt action", () => {
    const { valid } = validateCustomCommands([
      {
        name: "test",
        description: "Run and explain",
        action: { type: "shell-then-prompt", command: "npm test", prompt: "Explain failures:" },
      },
    ]);
    assert.equal(valid[0].action.type, "shell-then-prompt");
    if (valid[0].action.type === "shell-then-prompt") {
      assert.equal(valid[0].action.command, "npm test");
      assert.equal(valid[0].action.prompt, "Explain failures:");
    }
  });

  it("rejects shell-then-prompt with missing prompt", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "X", action: { type: "shell-then-prompt", command: "x" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("non-empty")));
  });

  it("rejects shell-then-prompt with empty command", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "X", action: { type: "shell-then-prompt", command: "", prompt: "p" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("non-empty")));
  });

  // ── unknown action type ─────────────────────────────────────────────────────

  it("rejects unknown action type", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "X", action: { type: "magic" } },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("unknown action type")));
  });

  it("rejects missing action", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "x", description: "X" },
    ]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes('"action" is required')));
  });

  // ── max commands limit ──────────────────────────────────────────────────────

  it("warns and truncates when more than 50 commands", () => {
    const raw = Array.from({ length: 55 }, (_, i) => ({
      name: `cmd${i}`,
      description: "A command",
      action: { type: "shell", command: "echo hi" },
    }));
    const { valid, errors } = validateCustomCommands(raw);
    assert.equal(valid.length, 50);
    assert.ok(errors.some((e) => e.includes("50")));
  });

  // ── valid partial batch ─────────────────────────────────────────────────────

  it("loads valid commands even when some entries are invalid", () => {
    const { valid, errors } = validateCustomCommands([
      { name: "good", description: "Good one", action: { type: "shell", command: "echo ok" } },
      { name: "BAD", description: "Bad name", action: { type: "shell", command: "x" } },
      { name: "also-good", description: "Another good", action: { type: "prompt", text: "Hello" } },
    ]);
    assert.equal(valid.length, 2);
    assert.ok(valid.some((c) => c.name === "good"));
    assert.ok(valid.some((c) => c.name === "also-good"));
    assert.ok(errors.length > 0);
  });

  // ── non-object entries ──────────────────────────────────────────────────────

  it("skips null entries in array", () => {
    const { valid, errors } = validateCustomCommands([null]);
    assert.equal(valid.length, 0);
    assert.ok(errors.some((e) => e.includes("must be an object")));
  });

  it("skips string entries in array", () => {
    const { valid } = validateCustomCommands(["not-an-object"]);
    assert.equal(valid.length, 0);
  });
});

// ── buildShellThenPromptText ──────────────────────────────────────────────────

describe("buildShellThenPromptText", () => {
  it("wraps output in a code fence after the prompt", () => {
    const result = buildShellThenPromptText("Explain failures:", "FAIL: test.ts:10");
    assert.ok(result.startsWith("Explain failures:"));
    assert.ok(result.includes("```"));
    assert.ok(result.includes("FAIL: test.ts:10"));
  });

  it("format: prompt then blank line then fenced output", () => {
    const result = buildShellThenPromptText("Review:", "output line");
    assert.equal(result, "Review:\n\n```\noutput line\n```");
  });

  it("trims trailing whitespace from output", () => {
    const result = buildShellThenPromptText("p", "  output  \n\n");
    assert.ok(result.includes("output"));
    assert.ok(!result.endsWith("  "));
  });

  it("handles empty output with a fallback message", () => {
    const result = buildShellThenPromptText("Explain:", "");
    assert.ok(result.includes("Explain:"));
    assert.ok(result.includes("no output"));
  });

  it("handles whitespace-only output as empty", () => {
    const result = buildShellThenPromptText("Explain:", "   \n  ");
    assert.ok(result.includes("no output"));
  });

  it("preserves multi-line output verbatim", () => {
    const output = "line1\nline2\nline3";
    const result = buildShellThenPromptText("Check:", output);
    assert.ok(result.includes("line1\nline2\nline3"));
  });

  it("prompt with no trailing newline stays clean", () => {
    const result = buildShellThenPromptText("Do X", "out");
    assert.ok(result.startsWith("Do X\n\n```"));
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("customCommands constants", () => {
  it("DEFAULT_CUSTOM_ICON is a non-empty string", () => {
    assert.equal(typeof DEFAULT_CUSTOM_ICON, "string");
    assert.ok(DEFAULT_CUSTOM_ICON.length > 0);
  });

  it("CUSTOM_COMMANDS_FILENAME is glass-commands.json", () => {
    assert.equal(CUSTOM_COMMANDS_FILENAME, "glass-commands.json");
  });

  it("CUSTOM_COMMANDS_DIR is .iivo", () => {
    assert.equal(CUSTOM_COMMANDS_DIR, ".iivo");
  });
});
