import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AletheiaNote } from "../shared/aletheiaNotes.ts";
import type { GlassProjectRecord } from "../shared/glassStorageProjectTypes.ts";
import { resolveAletheiaDiagnosticContext } from "../shared/memory/resolveAletheiaDiagnosticContext.ts";

function note(body: string, linkedProjectId?: string): AletheiaNote {
  return {
    id: "n1",
    body,
    category: "observation",
    source: "assistant",
    linkedProjectId,
    createdAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
  };
}

function project(id: string): GlassProjectRecord {
  return {
    id,
    kind: "design-to-code",
    title: "Card.tsx — Design to Code",
    createdAt: 1,
    updatedAt: 2,
    category: "Projects",
    source: "Design to Code",
    designCaptureId: id,
    status: "ready",
    action: "react",
    stack: "react-tsx",
    detectedFileName: "Card.tsx",
    revisionCount: 0,
  };
}

describe("resolveAletheiaDiagnosticContext", () => {
  test("injects D2C notes for diagnostic prompt without companion", () => {
    const ctx = resolveAletheiaDiagnosticContext({
      prompt: "what happened?",
      companionModeActive: false,
      notes: [
        note("Design to Code: React — generation failed.", "cap-1"),
      ],
      projects: [project("cap-1")],
      captures: undefined,
      latestProjectId: "cap-1",
    });
    assert.ok(ctx);
    assert.match(ctx!, /Aletheia notes/);
    assert.match(ctx!, /generation failed/);
    assert.match(ctx!, /Glass Storage project metadata/);
  });

  test("recall works with empty captures after restart", () => {
    const ctx = resolveAletheiaDiagnosticContext({
      prompt: "what did you save?",
      companionModeActive: false,
      notes: [note("Design to Code: saved to Projects.", "cap-2")],
      projects: [project("cap-2")],
      captures: {},
      latestProjectId: "cap-2",
    });
    assert.ok(ctx);
    assert.match(ctx!, /Card\.tsx/);
    assert.doesNotMatch(ctx!, /Recent Design to Code activity/);
  });

  test("companion general notes only when not diagnostic", () => {
    const ctx = resolveAletheiaDiagnosticContext({
      prompt: "help me with dark mode preferences",
      companionModeActive: true,
      notes: [
        note("Design to Code: saved.", "cap-1"),
        {
          id: "n2",
          body: "User prefers dark mode when coding",
          category: "general",
          source: "user",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      projects: [],
    });
    assert.ok(ctx);
    assert.match(ctx!, /dark mode/);
    assert.doesNotMatch(ctx!, /Glass Storage projects/);
  });
});
