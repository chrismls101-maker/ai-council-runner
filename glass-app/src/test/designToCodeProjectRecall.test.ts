import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { GlassProjectRecord } from "../shared/glassStorageProjectTypes.ts";
import type { AletheiaNote } from "../shared/aletheiaNotes.ts";
import {
  buildDesignToCodeProjectRecallAskContext,
  collectDesignToCodeRecallProjectIds,
  formatDesignToCodeProjectRecallContext,
  isDesignToCodeRecallPrompt,
} from "../shared/design/designToCodeProjectRecall.ts";

function project(overrides: Partial<GlassProjectRecord> = {}): GlassProjectRecord {
  return {
    id: "cap-1",
    kind: "design-to-code",
    title: "Card.tsx — Design to Code",
    createdAt: 1,
    updatedAt: 2,
    category: "Projects",
    source: "Design to Code",
    designCaptureId: "cap-1",
    status: "warning",
    action: "react",
    stack: "react-tsx",
    detectedFileName: "Card.tsx",
    warningSummary: "Border radius may differ",
    revisionCount: 1,
    ...overrides,
  };
}

function note(overrides: Partial<AletheiaNote> = {}): AletheiaNote {
  return {
    id: "n1",
    body: "Design to Code: React component (Card.tsx) — saved to Glass Storage under Projects.",
    category: "observation",
    source: "assistant",
    linkedProjectId: "cap-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("designToCodeProjectRecall", () => {
  test("recognizes recap prompts", () => {
    assert.equal(isDesignToCodeRecallPrompt("what did you save?"), true);
    assert.equal(isDesignToCodeRecallPrompt("show me the last design to code thing"), true);
    assert.equal(isDesignToCodeRecallPrompt("where is it?"), true);
    assert.equal(isDesignToCodeRecallPrompt("where did you save the component?"), true);
    assert.equal(isDesignToCodeRecallPrompt("summarize my calendar"), false);
  });

  test("collects project ids from latest, notes, and captures", () => {
    const ids = collectDesignToCodeRecallProjectIds({
      latestProjectId: "latest-1",
      notes: [note({ linkedProjectId: "cap-1" })],
      captures: {
        "cap-2": {
          feedItemId: "cap-2",
          imageDataUrl: "data:image/png;base64,AA==",
          createdAt: Date.now(),
          selectedStack: "react-tsx",
          refinementHistory: [],
          phase: "done",
          glassProjectId: "cap-2",
        },
      },
    });
    assert.deepEqual(ids, ["latest-1", "cap-1", "cap-2"]);
  });

  test("formats linked project metadata without code", () => {
    const ctx = formatDesignToCodeProjectRecallContext(
      ["cap-1"],
      [project()],
    );
    assert.match(ctx ?? "", /projectId=cap-1/);
    assert.match(ctx ?? "", /Card\.tsx/);
    assert.match(ctx ?? "", /fidelity notes/);
    assert.match(ctx ?? "", /Glass Storage → Projects/);
    assert.doesNotMatch(ctx ?? "", /result\.tsx/);
  });

  test("builds ask context only for recall prompts", () => {
    const ctx = buildDesignToCodeProjectRecallAskContext({
      prompt: "why did that fail?",
      latestProjectId: "cap-1",
      notes: [note()],
      projects: [project({ status: "failed", saveError: "disk full" })],
    });
    assert.match(ctx ?? "", /save incomplete — disk full/);

    const skipped = buildDesignToCodeProjectRecallAskContext({
      prompt: "write me a poem",
      latestProjectId: "cap-1",
      projects: [project()],
    });
    assert.equal(skipped, undefined);
  });
});
