import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDesignScreenSpec,
  createFallbackDesignScreenSpec,
} from "../shared/designToCode.ts";

describe("parseDesignScreenSpec", () => {
  test("parses valid JSON object", () => {
    const spec = parseDesignScreenSpec({
      screenType: "dashboard",
      confidence: 0.9,
      warnings: [],
      visibleRegions: [{ id: "nav", role: "navigation", label: "Top nav" }],
      layoutTree: "header + main",
      components: ["NavBar"],
      repeatedPatterns: ["card x3"],
      textContent: ["Hello"],
      palette: ["#fff"],
      typography: ["14px medium"],
      spacing: ["16px gap"],
      borders: [],
      shadows: [],
      interactionAffordances: ["primary button"],
      estimatedResponsiveness: "desktop",
      uncertainAreas: [],
    });
    assert.equal(spec.screenType, "dashboard");
    assert.equal(spec.confidence, 0.9);
    assert.equal(spec.visibleRegions[0]?.id, "nav");
    assert.deepEqual(spec.components, ["NavBar"]);
  });

  test("returns fallback on null input", () => {
    const spec = parseDesignScreenSpec(null);
    assert.equal(spec.screenType, "unknown");
    assert.ok(spec.warnings.includes("spec_parse_failed"));
  });

  test("adds low_confidence warning when confidence < 0.35", () => {
    const spec = parseDesignScreenSpec({ confidence: 0.1, layoutTree: "x" });
    assert.ok(spec.warnings.includes("low_confidence"));
  });
});

describe("createFallbackDesignScreenSpec", () => {
  test("includes provided warnings", () => {
    const spec = createFallbackDesignScreenSpec(["spec_parse_failed"]);
    assert.ok(spec.warnings.includes("spec_parse_failed"));
    assert.equal(spec.confidence, 0.2);
  });
});
