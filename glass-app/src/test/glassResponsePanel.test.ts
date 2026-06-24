/**
 * Glass Response Panel — substantial-response detection + body selection.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { lastAskResponseBody, isSubstantialLastAskResponse, isSubstantialResponse } from "../shared/glassAskTypes.ts";

describe("lastAskResponseBody", () => {
  test("prefers fullAnswer over overlay snippet", () => {
    const body = lastAskResponseBody({
      prompt: "Explain React hooks",
      answer: "Short HUD line.",
      fullAnswer: "```tsx\nexport function App() {}\n```",
      at: new Date().toISOString(),
    });
    assert.match(body, /```tsx/);
  });
});

describe("isSubstantialResponse", () => {
  test("detects long answers", () => {
    assert.equal(isSubstantialResponse("x".repeat(301)), true);
    assert.equal(isSubstantialResponse("x".repeat(120)), false);
  });

  test("detects fenced code", () => {
    assert.equal(isSubstantialResponse("Here:\n```js\nconst x = 1;\n```"), true);
  });

  test("detects markdown headings", () => {
    assert.equal(isSubstantialResponse("Intro\n## Section\nBody"), true);
  });
});

describe("isSubstantialLastAskResponse", () => {
  test("uses fullAnswer for substantial check when short overlay answer is tiny", () => {
    assert.equal(
      isSubstantialLastAskResponse({
        prompt: "Build me a component",
        answer: "Done.",
        fullAnswer: `# Plan\n\n${"line\n".repeat(80)}`,
        at: new Date().toISOString(),
      }),
      true,
    );
  });
});
