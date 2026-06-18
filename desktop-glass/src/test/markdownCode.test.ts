/**
 * Unit tests for src/shared/markdownCode.ts — pure code block extractor.
 * No Electron required; runs in the Node test runner.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractFirstCodeBlock,
  hasCodeBlock,
} from "../shared/markdownCode.ts";

// ── extractFirstCodeBlock ─────────────────────────────────────────────────────

describe("extractFirstCodeBlock", () => {
  it("returns null for plain markdown with no code blocks", () => {
    const md = "Here is some **bold** text and a [link](https://example.com).";
    assert.equal(extractFirstCodeBlock(md), null);
  });

  it("extracts a simple triple-backtick block", () => {
    const md = "Some text\n```\nconsole.log('hello');\n```\nMore text";
    assert.equal(extractFirstCodeBlock(md), "console.log('hello');");
  });

  it("extracts a block with a language tag", () => {
    const md = "```typescript\nconst x: number = 1;\n```";
    assert.equal(extractFirstCodeBlock(md), "const x: number = 1;");
  });

  it("extracts a triple-tilde block", () => {
    const md = "~~~python\ndef greet():\n    print('hi')\n~~~";
    assert.equal(extractFirstCodeBlock(md), "def greet():\n    print('hi')");
  });

  it("returns content of the FIRST block when multiple are present", () => {
    const md = [
      "```js",
      "const a = 1;",
      "```",
      "Some prose.",
      "```ts",
      "const b: number = 2;",
      "```",
    ].join("\n");
    assert.equal(extractFirstCodeBlock(md), "const a = 1;");
  });

  it("preserves indentation inside the block", () => {
    const md = "```\n  indented line\n    doubly indented\n```";
    assert.equal(extractFirstCodeBlock(md), "  indented line\n    doubly indented");
  });

  it("preserves blank lines inside the block", () => {
    const md = "```\nline one\n\nline three\n```";
    assert.equal(extractFirstCodeBlock(md), "line one\n\nline three");
  });

  it("returns collected content for an unclosed fence", () => {
    const md = "```ts\nfunction foo() {\n  return 1;\n}";
    const result = extractFirstCodeBlock(md);
    assert(result !== null);
    assert(result.includes("function foo()"));
  });

  it("returns null for an empty unclosed fence with no content lines", () => {
    // Opening fence with nothing after it
    const result = extractFirstCodeBlock("```");
    assert.equal(result, null);
  });

  it("handles fences longer than three characters", () => {
    const md = "````ts\nconst x = 1;\n````";
    assert.equal(extractFirstCodeBlock(md), "const x = 1;");
  });

  it("does not treat a fence inside a block as a closing fence (different char)", () => {
    // Opening ``` then a ~~~ line inside — should NOT close
    const md = "```\nsome code\n~~~\nmore code\n```";
    assert.equal(extractFirstCodeBlock(md), "some code\n~~~\nmore code");
  });

  it("handles a realistic AI response with prose + code block + prose", () => {
    const md = [
      "The issue is in the `fetchData` function. Replace it with:",
      "",
      "```typescript",
      "async function fetchData(url: string): Promise<Data> {",
      "  const res = await fetch(url);",
      "  if (!res.ok) throw new Error(`HTTP ${res.status}`);",
      "  return res.json() as Promise<Data>;",
      "}",
      "```",
      "",
      "This adds proper error handling for non-2xx responses.",
    ].join("\n");

    const code = extractFirstCodeBlock(md);
    assert(code !== null);
    assert(code.includes("async function fetchData"));
    assert(code.includes("throw new Error"));
    // Should NOT include the prose after the fence
    assert(!code.includes("This adds proper error handling"));
  });

  it("returns null for empty string", () => {
    assert.equal(extractFirstCodeBlock(""), null);
  });

  it("returns null for markdown with only inline code, no fences", () => {
    const md = "Use `const` instead of `var` for block-scoped variables.";
    assert.equal(extractFirstCodeBlock(md), null);
  });
});

// ── hasCodeBlock ──────────────────────────────────────────────────────────────

describe("hasCodeBlock", () => {
  it("returns true when a code block is present", () => {
    const md = "Here:\n```\ncode\n```";
    assert.equal(hasCodeBlock(md), true);
  });

  it("returns false for plain text", () => {
    assert.equal(hasCodeBlock("Just some plain text without any fences."), false);
  });

  it("returns true for unclosed fences with content", () => {
    assert.equal(hasCodeBlock("```\nsome content here"), true);
  });

  it("returns false for empty string", () => {
    assert.equal(hasCodeBlock(""), false);
  });

  it("returns true for tilde fences", () => {
    assert.equal(hasCodeBlock("~~~\ncode\n~~~"), true);
  });
});
