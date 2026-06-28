import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createAletheiaNote } from "../shared/aletheiaNotes.ts";
import {
  inferNoteFeature,
  inferNoteStatus,
  noteTitle,
  filterNotesByFeature,
} from "../shared/memory/aletheiaNotePresentation.ts";

describe("aletheiaNotePresentation", () => {
  test("infers design-to-code feature and status", () => {
    const note = createAletheiaNote({
      body: "Design to Code: React (Card.tsx) — saved to Glass Storage under Projects.",
      linkedProjectId: "cap-1",
    });
    assert.equal(inferNoteFeature(note), "design-to-code");
    assert.equal(inferNoteStatus(note), "saved");
    assert.match(noteTitle(note), /React/);
  });

  test("filters notes by feature", () => {
    const d2c = createAletheiaNote({ body: "Design to Code: failed." });
    const general = createAletheiaNote({ body: "User prefers dark mode." });
    const filtered = filterNotesByFeature([d2c, general], "design-to-code");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, d2c.id);
  });
});
