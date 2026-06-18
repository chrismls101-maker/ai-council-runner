/**
 * Unit tests for design-to-code prompt construction (#designToCode).
 *
 * Tests the pure logic in src/shared/designToCode.ts:
 *   - isEditorAppName
 *   - langTagFor
 *   - DESIGN_TO_CODE_ACTION_LABELS
 *   - buildDesignToCodePrompt (all 4 actions)
 *
 * Framework: node:test + node:assert/strict (no vitest)
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isEditorAppName,
  langTagFor,
  DESIGN_TO_CODE_ACTION_LABELS,
  buildDesignToCodePrompt,
  type DesignToCodeContext,
} from "../shared/designToCode.ts";

// ── isEditorAppName ───────────────────────────────────────────────────────────

describe("isEditorAppName", () => {
  test("returns true for Cursor", () => {
    assert.equal(isEditorAppName("Cursor"), true);
  });

  test("returns true for Code", () => {
    assert.equal(isEditorAppName("Code"), true);
  });

  test("returns true for Xcode", () => {
    assert.equal(isEditorAppName("Xcode"), true);
  });

  test("returns true for Zed", () => {
    assert.equal(isEditorAppName("Zed"), true);
  });

  test("returns false for Chrome", () => {
    assert.equal(isEditorAppName("Chrome"), false);
  });

  test("returns false for Figma", () => {
    assert.equal(isEditorAppName("Figma"), false);
  });

  test("returns false for null", () => {
    assert.equal(isEditorAppName(null), false);
  });

  test("returns false for undefined", () => {
    assert.equal(isEditorAppName(undefined), false);
  });

  test("returns false for empty string", () => {
    assert.equal(isEditorAppName(""), false);
  });
});

// ── langTagFor ────────────────────────────────────────────────────────────────

describe("langTagFor", () => {
  test("TypeScript (React) → tsx", () => {
    assert.equal(langTagFor("TypeScript (React)"), "tsx");
  });

  test("string with tsx → tsx", () => {
    assert.equal(langTagFor("tsx"), "tsx");
  });

  test("string with TSX → tsx", () => {
    assert.equal(langTagFor("TSX"), "tsx");
  });

  test("string with React + TypeScript → tsx", () => {
    assert.equal(langTagFor("React TypeScript"), "tsx");
  });

  test("TypeScript alone → ts", () => {
    assert.equal(langTagFor("TypeScript"), "ts");
  });

  test("JavaScript (React) → jsx", () => {
    assert.equal(langTagFor("JavaScript (React)"), "jsx");
  });

  test("string with jsx → jsx", () => {
    assert.equal(langTagFor("jsx"), "jsx");
  });

  test("string with JSX → jsx", () => {
    assert.equal(langTagFor("JSX"), "jsx");
  });

  test("string with React + JavaScript → jsx", () => {
    assert.equal(langTagFor("React JavaScript"), "jsx");
  });

  test("JavaScript alone → js", () => {
    assert.equal(langTagFor("JavaScript"), "js");
  });

  test("CSS → css", () => {
    assert.equal(langTagFor("CSS"), "css");
  });

  test("null → code", () => {
    assert.equal(langTagFor(null), "code");
  });

  test("empty string → code", () => {
    assert.equal(langTagFor(""), "code");
  });

  test("unknown language → code", () => {
    assert.equal(langTagFor("Rust"), "code");
  });

  test("Python → code", () => {
    assert.equal(langTagFor("Python"), "code");
  });
});

// ── DESIGN_TO_CODE_ACTION_LABELS ──────────────────────────────────────────────

describe("DESIGN_TO_CODE_ACTION_LABELS", () => {
  test("react label is correct", () => {
    assert.equal(DESIGN_TO_CODE_ACTION_LABELS["react"], "React component");
  });

  test("html label is correct", () => {
    assert.equal(DESIGN_TO_CODE_ACTION_LABELS["html"], "HTML / CSS");
  });

  test("describe label is correct", () => {
    assert.equal(DESIGN_TO_CODE_ACTION_LABELS["describe"], "Describe this design");
  });

  test("match-codebase label is correct", () => {
    assert.equal(DESIGN_TO_CODE_ACTION_LABELS["match-codebase"], "Match to my codebase");
  });
});

// ── buildDesignToCodePrompt ───────────────────────────────────────────────────

const emptyCtx: DesignToCodeContext = {
  fileName: null,
  language: null,
  filePath: null,
  content: null,
};

const ctxWithContent: DesignToCodeContext = {
  fileName: "Button.tsx",
  language: "TypeScript (React)",
  filePath: "/src/components/Button.tsx",
  content: `import React from "react";\nexport const Button = ({ label }: { label: string }) => <button>{label}</button>;`,
};

const ctxWithNullContent: DesignToCodeContext = {
  fileName: null,
  language: null,
  filePath: null,
  content: null,
};

describe("buildDesignToCodePrompt - react", () => {
  const prompt = buildDesignToCodePrompt("react", emptyCtx);

  test("starts with 'You are given a screenshot'", () => {
    assert(
      prompt.startsWith("You are given a screenshot"),
      `prompt should start with preamble, got: ${prompt.slice(0, 50)}`
    );
  });

  test("contains 'React'", () => {
    assert(prompt.includes("React"), "should mention React");
  });

  test("contains 'tsx' fence", () => {
    assert(prompt.includes("tsx"), "should mention tsx code block");
  });
});

describe("buildDesignToCodePrompt - html", () => {
  const prompt = buildDesignToCodePrompt("html", emptyCtx);

  test("starts with 'You are given a screenshot'", () => {
    assert(prompt.startsWith("You are given a screenshot"));
  });

  test("contains 'HTML'", () => {
    assert(prompt.includes("HTML"), "should mention HTML");
  });

  test("contains 'html' fence reference", () => {
    assert(prompt.includes("html"), "should mention html code block");
  });

  test("does not mention React", () => {
    assert(!prompt.includes("React"), "html prompt should not mention React");
  });
});

describe("buildDesignToCodePrompt - describe", () => {
  const prompt = buildDesignToCodePrompt("describe", emptyCtx);

  test("starts with 'You are given a screenshot'", () => {
    assert(prompt.startsWith("You are given a screenshot"));
  });

  test("contains instruction not to write code (case insensitive)", () => {
    assert(
      prompt.toLowerCase().includes("do not") && prompt.toLowerCase().includes("code"),
      `should contain no-code instruction, got: ${prompt}`
    );
  });

  test("does not instruct use of code fences", () => {
    assert(
      !prompt.includes("```"),
      "describe prompt should not contain code fence characters"
    );
  });
});

describe("buildDesignToCodePrompt - match-codebase with content", () => {
  const prompt = buildDesignToCodePrompt("match-codebase", ctxWithContent);

  test("starts with 'You are given a screenshot'", () => {
    assert(prompt.startsWith("You are given a screenshot"));
  });

  test("contains the fileName", () => {
    assert(prompt.includes("Button.tsx"), "should include the file name");
  });

  test("contains the file content", () => {
    assert(
      prompt.includes("export const Button"),
      "should include the codebase content"
    );
  });

  test("contains 'Match the conventions'", () => {
    assert(prompt.includes("Match the conventions"), "should include match conventions instruction");
  });
});

describe("buildDesignToCodePrompt - match-codebase with null content", () => {
  const prompt = buildDesignToCodePrompt("match-codebase", ctxWithNullContent);

  test("starts with 'You are given a screenshot'", () => {
    assert(prompt.startsWith("You are given a screenshot"));
  });

  test("does not contain an empty code fence", () => {
    assert(
      !prompt.includes("```\n\n```"),
      "should not contain an empty code fence"
    );
  });

  test("contains fallback notice", () => {
    assert(
      prompt.includes("no codebase sample was available"),
      "should include fallback notice"
    );
  });

  test("contains 'React'", () => {
    assert(prompt.includes("React"), "null-content match-codebase should still mention React");
  });
});

describe("buildDesignToCodePrompt - all actions start with preamble", () => {
  const actions = ["react", "html", "describe", "match-codebase"] as const;

  for (const action of actions) {
    test(`${action} starts with 'You are given a screenshot of a UI design.'`, () => {
      const prompt = buildDesignToCodePrompt(action, emptyCtx);
      assert(
        prompt.startsWith("You are given a screenshot of a UI design."),
        `${action} prompt does not start with expected preamble`
      );
    });
  }
});

describe("buildDesignToCodePrompt - match-codebase with importedFiles (#164)", () => {
  const ctxWithImports: import("../shared/designToCode.ts").DesignToCodeContext = {
    fileName: "Dashboard.tsx",
    language: "TypeScript (React)",
    filePath: "/src/Dashboard.tsx",
    content: "export function Dashboard() { return <div /> }",
    importedFiles: [
      {
        fileName: "useAuth.ts",
        language: "TypeScript",
        filePath: "/src/useAuth.ts",
        content: "export function useAuth() { return { user: null }; }",
      },
      {
        fileName: "styles.ts",
        language: "TypeScript",
        filePath: "/src/styles.ts",
        content: "export const theme = { primary: '#000' };",
      },
    ],
  };

  const prompt = buildDesignToCodePrompt("match-codebase", ctxWithImports);

  test("includes the target file content", () => {
    assert(prompt.includes("Dashboard.tsx"), "should mention target file name");
    assert(prompt.includes("export function Dashboard"), "should include target file content");
  });

  test("includes the imported files header", () => {
    assert(
      prompt.includes("Here are 2 file(s) that the above file imports"),
      "should include imported files header with count",
    );
  });

  test("includes each imported file name and content", () => {
    assert(prompt.includes("useAuth.ts"), "should include first imported file name");
    assert(prompt.includes("export function useAuth"), "should include first imported file content");
    assert(prompt.includes("styles.ts"), "should include second imported file name");
    assert(prompt.includes("export const theme"), "should include second imported file content");
  });

  test("imported files section appears after target file section", () => {
    const targetIdx = prompt.indexOf("export function Dashboard");
    const importsIdx = prompt.indexOf("Here are 2 file(s)");
    assert(importsIdx > targetIdx, "imports section should appear after target file content");
  });

  test("does not include imported files section when importedFiles is empty", () => {
    const ctxNoImports: import("../shared/designToCode.ts").DesignToCodeContext = {
      ...ctxWithImports,
      importedFiles: [],
    };
    const p = buildDesignToCodePrompt("match-codebase", ctxNoImports);
    assert(!p.includes("Here are"), "empty importedFiles should not produce imports section");
  });

  test("does not include imported files section when importedFiles is undefined", () => {
    const ctxNoImports: import("../shared/designToCode.ts").DesignToCodeContext = {
      ...ctxWithImports,
      importedFiles: undefined,
    };
    const p = buildDesignToCodePrompt("match-codebase", ctxNoImports);
    assert(!p.includes("Here are"), "undefined importedFiles should not produce imports section");
  });
});
