import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSharedVisionPreamble,
  buildGenerationPrompt,
  buildRefinementPrompt,
  SHARED_VISION_PREAMBLE_FIRST_LINE,
} from "../shared/designToCode.ts";
import { createFallbackDesignScreenSpec } from "../shared/designToCode.ts";

const emptyCtx = {
  fileName: null,
  language: null,
  filePath: null,
  content: null,
};

const baseSpec = createFallbackDesignScreenSpec([]);

describe("buildSharedVisionPreamble", () => {
  test("includes source-of-truth line", () => {
    assert.ok(buildSharedVisionPreamble().includes(SHARED_VISION_PREAMBLE_FIRST_LINE));
  });
});

describe("buildGenerationPrompt", () => {
  test("react action includes stack hint and fenced block contract", () => {
    const prompt = buildGenerationPrompt({
      action: "react",
      stack: "react-tailwind",
      screenSpec: baseSpec,
      ctx: emptyCtx,
    });
    assert.ok(prompt.includes("Tailwind"));
    assert.ok(prompt.includes("```"));
  });

  test("describe action asks for prose only", () => {
    const prompt = buildGenerationPrompt({
      action: "describe",
      stack: "react-tsx",
      screenSpec: baseSpec,
      ctx: emptyCtx,
    });
    assert.ok(prompt.toLowerCase().includes("visual analysis"));
    assert.ok(!prompt.includes("Return exactly one fenced code block"));
  });
});

describe("buildRefinementPrompt", () => {
  test("includes prior feedback and fidelity instruction", () => {
    const prompt = buildRefinementPrompt("Make the header taller");
    assert.ok(prompt.includes("Make the header taller"));
    assert.ok(prompt.toLowerCase().includes("fidelity"));
  });
});
