import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { DesignToCodeSession } from "../shared/design/designToCodeTypes.ts";
import {
  buildDesignToCodeAletheiaNote,
  filterRecentDesignToCodeNotes,
  formatDesignToCodeAskContext,
  isAletheiaDiagnosticPrompt,
  shouldPersistLatestDesignToCodeProjectPointer,
} from "../shared/design/designToCodeAletheiaContext.ts";

function session(overrides: Partial<DesignToCodeSession> = {}): DesignToCodeSession {
  return {
    id: "cap-1",
    feedItemId: "cap-1",
    imageDataUrl: "data:image/png;base64,AA==",
    createdAt: Date.now() - 60_000,
    selectedStack: "react-tsx",
    refinementHistory: [],
    phase: "done",
    selectedAction: "react",
    glassProjectSaveStatus: "saved",
    detectedFile: { fileName: "Card.tsx", filePath: "/src/Card.tsx", language: "tsx" },
    ...overrides,
  };
}

describe("designToCodeAletheiaContext", () => {
  test("diagnostic prompts are recognized", () => {
    assert.equal(isAletheiaDiagnosticPrompt("what happened?"), true);
    assert.equal(isAletheiaDiagnosticPrompt("summarize this component"), false);
  });

  test("formats recent capture summary for asks", () => {
    const ctx = formatDesignToCodeAskContext({
      "cap-1": session({ glassProjectSaveStatus: "failed", glassProjectSaveError: "disk full" }),
    });
    assert.match(ctx ?? "", /Design to Code activity/);
    assert.match(ctx ?? "", /save failed — disk full/);
    assert.match(ctx ?? "", /Card\.tsx/);
  });

  test("builds Aletheia note bodies for events", () => {
    const note = buildDesignToCodeAletheiaNote({
      event: "save_failed",
      session: session({ glassProjectSaveError: "permission denied" }),
      error: "permission denied",
    });
    assert.match(note.body, /saving to Glass Storage failed/);
    assert.equal(note.rationale, "permission denied");
    assert.equal(note.linkedProjectId, "cap-1");
  });

  test("generation_failed note includes linkedProjectId", () => {
    const note = buildDesignToCodeAletheiaNote({
      event: "generation_failed",
      session: session({ phase: "failed", statusLine: "API timeout" }),
      error: "API timeout",
    });
    assert.match(note.body, /generation failed/);
    assert.equal(note.linkedProjectId, "cap-1");
  });

  test("shouldPersistLatestDesignToCodeProjectPointer skips gen-fail before save", () => {
    assert.equal(
      shouldPersistLatestDesignToCodeProjectPointer(
        "generation_failed",
        session({ phase: "failed" }),
      ),
      false,
    );
    assert.equal(
      shouldPersistLatestDesignToCodeProjectPointer(
        "generation_failed",
        session({ phase: "failed", glassProjectId: "proj-existing" }),
      ),
      true,
    );
    assert.equal(
      shouldPersistLatestDesignToCodeProjectPointer("save_succeeded", session()),
      true,
    );
  });

  test("filters recent design-to-code notes", () => {
    const now = Date.now();
    const notes = filterRecentDesignToCodeNotes([
      { body: "Design to Code: saved", updatedAt: now - 1_000 },
      { body: "Other note", updatedAt: now },
      { body: "Design to Code: failed", updatedAt: now - 2_000 },
    ]);
    assert.equal(notes.length, 2);
    assert.match(notes[0]!.body, /saved/);
  });
});
