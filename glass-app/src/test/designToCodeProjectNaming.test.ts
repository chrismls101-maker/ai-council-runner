import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  primaryOutputFileName,
  titleForDesignToCodeProject,
} from "../main/design/designToCodeProjectNaming.ts";
import type { DesignToCodeSession } from "../shared/designToCode.ts";

function baseSession(overrides: Partial<DesignToCodeSession> = {}): DesignToCodeSession {
  return {
    id: "cap-1",
    feedItemId: "cap-1",
    imageDataUrl: "data:image/png;base64,AA==",
    createdAt: Date.parse("2026-06-28T04:12:11Z"),
    selectedStack: "react-tsx",
    refinementHistory: [],
    phase: "done",
    ...overrides,
  };
}

describe("designToCodeProjectNaming", () => {
  test("title prefers detected file name", () => {
    const title = titleForDesignToCodeProject(
      baseSession({
        detectedFile: { fileName: "Button.tsx", filePath: "/src/Button.tsx", language: "tsx" },
      }),
      "react",
    );
    assert.equal(title, "Button.tsx — Design to Code");
  });

  test("title uses screen spec component label", () => {
    const title = titleForDesignToCodeProject(
      baseSession({
        screenSpec: {
          screenType: "card",
          confidence: 0.8,
          warnings: [],
          visibleRegions: [],
          layoutTree: "",
          components: ["Pricing Card"],
          repeatedPatterns: [],
          textContent: [],
          palette: [],
          typography: [],
          spacing: [],
          borders: [],
          shadows: [],
          interactionAffordances: [],
          estimatedResponsiveness: "",
          uncertainAreas: [],
        },
      }),
      "html",
    );
    assert.equal(title, "Pricing Card — Design to Code");
  });

  test("primary output extension by action", () => {
    assert.equal(primaryOutputFileName("react", "react-tsx"), "result.tsx");
    assert.equal(primaryOutputFileName("html", "html-css"), "result.html");
    assert.equal(primaryOutputFileName("describe", "react-tsx"), "result.md");
    assert.equal(primaryOutputFileName("match-codebase", "vue"), "result.vue");
  });
});
