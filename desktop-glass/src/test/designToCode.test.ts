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
  DESIGN_STACK_LABELS,
  DESIGN_STACK_EXTENSIONS,
  DEFAULT_DESIGN_STACK,
  stackHint,
  buildDesignToCodePrompt,
  getActionLabel,
  type DesignToCodeContext,
  type DesignStack,
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
    assert.equal(DESIGN_TO_CODE_ACTION_LABELS["describe"], "Describe this");
  });

  test("match-codebase label is correct", () => {
    assert.equal(DESIGN_TO_CODE_ACTION_LABELS["match-codebase"], "Match my codebase");
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

describe("buildDesignToCodePrompt - react", () => {
  const prompt = buildDesignToCodePrompt("react", emptyCtx);

  test("starts with 'You are given a visual reference screenshot'", () => {
    assert(
      prompt.startsWith("You are given a visual reference screenshot"),
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

  test("starts with 'You are given a visual reference screenshot'", () => {
    assert(prompt.startsWith("You are given a visual reference screenshot"));
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

  test("starts with 'You are given a visual reference screenshot'", () => {
    assert(prompt.startsWith("You are given a visual reference screenshot"));
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

  test("starts with 'You are given a visual reference screenshot'", () => {
    assert(prompt.startsWith("You are given a visual reference screenshot"));
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
  const prompt = buildDesignToCodePrompt("match-codebase", emptyCtx);

  test("starts with 'You are given a visual reference screenshot'", () => {
    assert(prompt.startsWith("You are given a visual reference screenshot"));
  });

  test("does not contain an empty code fence", () => {
    assert(
      !prompt.includes("```\n\n```"),
      "should not contain an empty code fence"
    );
  });

  test("contains fallback notice", () => {
    assert(
      prompt.includes("No codebase file was available"),
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
    test(`${action} starts with 'You are given a visual reference screenshot.'`, () => {
      const prompt = buildDesignToCodePrompt(action, emptyCtx);
      assert(
        prompt.startsWith("You are given a visual reference screenshot."),
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

// ── DESIGN_STACK_LABELS + DESIGN_STACK_EXTENSIONS completeness (#163-F) ────────

describe("DESIGN_STACK_LABELS", () => {
  const ALL_STACKS: DesignStack[] = [
    "react-tsx", "react-tailwind", "next-tailwind", "remix",
    "vue", "nuxt", "svelte", "solid", "astro", "react-native",
    "html-css", "angular",
  ];

  test("DEFAULT_DESIGN_STACK is react-tsx", () => {
    assert.equal(DEFAULT_DESIGN_STACK, "react-tsx");
  });

  for (const stack of ALL_STACKS) {
    test(`${stack} has a label`, () => {
      assert(
        typeof DESIGN_STACK_LABELS[stack] === "string" && DESIGN_STACK_LABELS[stack].length > 0,
        `${stack} should have a non-empty label`,
      );
    });

    test(`${stack} has an extension`, () => {
      const ext = DESIGN_STACK_EXTENSIONS[stack];
      assert(typeof ext === "string" && ext.startsWith("."), `${stack} should have a dot-prefixed extension`);
    });
  }
});

// ── stackHint (#163-F) ────────────────────────────────────────────────────────

describe("stackHint", () => {
  const ALL_STACKS: DesignStack[] = [
    "react-tsx", "react-tailwind", "next-tailwind", "vue", "svelte", "html-css", "angular",
  ];

  for (const stack of ALL_STACKS) {
    test(`${stack} returns a non-empty string`, () => {
      const hint = stackHint(stack);
      assert(typeof hint === "string" && hint.length > 0, `stackHint(${stack}) should be non-empty`);
    });
  }

  test("react-tsx mentions TypeScript", () => {
    assert(stackHint("react-tsx").includes("TypeScript"));
  });

  test("react-tailwind mentions Tailwind", () => {
    assert(stackHint("react-tailwind").includes("Tailwind"));
  });

  test("next-tailwind mentions Next.js", () => {
    assert(stackHint("next-tailwind").includes("Next.js"));
  });

  test("vue mentions Composition API", () => {
    assert(stackHint("vue").includes("Composition API"));
  });

  test("svelte mentions Svelte 5", () => {
    assert(stackHint("svelte").includes("Svelte 5"));
  });

  test("html-css mentions no JavaScript frameworks", () => {
    assert(stackHint("html-css").toLowerCase().includes("no javascript"));
  });

  test("angular mentions standalone component", () => {
    assert(stackHint("angular").toLowerCase().includes("standalone"));
  });

  test("nuxt mentions Nuxt 3", () => {
    assert(stackHint("nuxt").includes("Nuxt 3"));
  });

  test("solid mentions Solid.js", () => {
    assert(stackHint("solid").includes("Solid.js"));
  });

  test("astro mentions Astro", () => {
    assert(stackHint("astro").includes("Astro"));
  });

  test("remix mentions Remix", () => {
    assert(stackHint("remix").includes("Remix"));
  });

  test("react-native mentions React Native", () => {
    assert(stackHint("react-native").includes("React Native"));
  });
});

// ── buildDesignToCodePrompt — stack-aware branches (#163-F) ──────────────────

describe("buildDesignToCodePrompt - react with Tailwind stacks", () => {
  test("react-tailwind → prompt includes Tailwind utility classes", () => {
    const p = buildDesignToCodePrompt("react", emptyCtx, "react-tailwind");
    assert(p.includes("Tailwind"), "react-tailwind should inject Tailwind hint");
    assert(!p.includes("Infer"), "should not use infer hint when Tailwind is selected");
  });

  test("next-tailwind → prompt includes Tailwind utility classes", () => {
    const p = buildDesignToCodePrompt("react", emptyCtx, "next-tailwind");
    assert(p.includes("Tailwind"), "next-tailwind should inject Tailwind hint");
  });

  test("react-tsx → prompt uses infer styling hint", () => {
    const p = buildDesignToCodePrompt("react", emptyCtx, "react-tsx");
    assert(p.includes("Infer"), "react-tsx should use the infer styling hint");
    assert(!p.includes("utility classes"), "react-tsx should not include Tailwind utility-classes instruction");
  });
});

describe("buildDesignToCodePrompt - match-codebase no-content with non-default stacks", () => {
  const nonDefaultStacks: DesignStack[] = [
    "vue", "nuxt", "svelte", "solid", "astro", "remix", "react-native",
    "html-css", "angular", "react-tailwind",
  ];

  for (const stack of nonDefaultStacks) {
    test(`${stack} fallback includes stack hint`, () => {
      const p = buildDesignToCodePrompt("match-codebase", emptyCtx, stack);
      assert(p.includes("No codebase file was available"), `${stack}: should have fallback notice`);
      const hint = stackHint(stack);
      // The hint text (or a meaningful fragment of it) should appear in the prompt
      const hintFragment = hint.split(" ").slice(0, 4).join(" ");
      assert(
        p.includes(hintFragment),
        `${stack}: prompt should include stack hint fragment "${hintFragment}"`,
      );
    });
  }
});

// ── getActionLabel (#167) ─────────────────────────────────────────────────────

describe("getActionLabel", () => {
  // react action: stack-specific labels
  test("react + react-tsx → React component", () => {
    assert.strictEqual(getActionLabel("react", "react-tsx"), "React component");
  });
  test("react + vue → Vue component", () => {
    assert.strictEqual(getActionLabel("react", "vue"), "Vue component");
  });
  test("react + nuxt → Vue component", () => {
    assert.strictEqual(getActionLabel("react", "nuxt"), "Vue component");
  });
  test("react + svelte → Svelte component", () => {
    assert.strictEqual(getActionLabel("react", "svelte"), "Svelte component");
  });
  test("react + solid → Solid component", () => {
    assert.strictEqual(getActionLabel("react", "solid"), "Solid component");
  });
  test("react + astro → Astro component", () => {
    assert.strictEqual(getActionLabel("react", "astro"), "Astro component");
  });
  test("react + react-native → Native component", () => {
    assert.strictEqual(getActionLabel("react", "react-native"), "Native component");
  });
  test("react + angular → Angular component", () => {
    assert.strictEqual(getActionLabel("react", "angular"), "Angular component");
  });
  test("react + remix → Remix component", () => {
    assert.strictEqual(getActionLabel("react", "remix"), "Remix component");
  });
  // html action
  test("html + html-css → HTML / CSS", () => {
    assert.strictEqual(getActionLabel("html", "html-css"), "HTML / CSS");
  });
  test("html + react-native → Native layout", () => {
    assert.strictEqual(getActionLabel("html", "react-native"), "Native layout");
  });
  test("html + react-tsx → HTML / CSS", () => {
    assert.strictEqual(getActionLabel("html", "react-tsx"), "HTML / CSS");
  });
  // describe and match-codebase don't change
  test("describe → same regardless of stack", () => {
    assert.strictEqual(getActionLabel("describe", "vue"), getActionLabel("describe", "react-tsx"));
  });
  test("match-codebase → same regardless of stack", () => {
    assert.strictEqual(getActionLabel("match-codebase", "solid"), getActionLabel("match-codebase", "angular"));
  });
  // default branch: react-tailwind, next-tailwind, html-css all → React component
  test("react + react-tailwind → React component", () => {
    assert.strictEqual(getActionLabel("react", "react-tailwind"), "React component");
  });
  test("react + next-tailwind → React component", () => {
    assert.strictEqual(getActionLabel("react", "next-tailwind"), "React component");
  });
  test("react + html-css → React component", () => {
    assert.strictEqual(getActionLabel("react", "html-css"), "React component");
  });
});

// ── buildDesignToCodePrompt - refinement feedback (#166) ──────────────────────

describe("buildDesignToCodePrompt - refinement feedback", () => {
  test("appends refinement feedback when provided", () => {
    const p = buildDesignToCodePrompt("react", emptyCtx, "react-tsx", "make the button bigger");
    assert.ok(p.includes("Refinement request:"));
    assert.ok(p.includes("make the button bigger"));
  });

  test("does not append section when feedback is empty string", () => {
    const p = buildDesignToCodePrompt("react", emptyCtx, "react-tsx", "");
    assert.ok(!p.includes("Refinement request:"));
  });

  test("does not append section when feedback is only whitespace", () => {
    const p = buildDesignToCodePrompt("react", emptyCtx, "react-tsx", "   ");
    assert.ok(!p.includes("Refinement request:"));
  });

  test("does not append section when feedback is undefined", () => {
    const p = buildDesignToCodePrompt("react", emptyCtx, "react-tsx", undefined);
    assert.ok(!p.includes("Refinement request:"));
  });

  test("feedback appears after main prompt body", () => {
    const p = buildDesignToCodePrompt("react", emptyCtx, "react-tsx", "add dark mode");
    const refineIdx = p.indexOf("Refinement request:");
    const preambleIdx = p.indexOf("You are given");
    assert.ok(refineIdx > preambleIdx);
  });
});
