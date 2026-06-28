import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AletheiaNote } from "../shared/aletheiaNotes.ts";
import type { GlassProjectRecord } from "../shared/glassStorageProjectTypes.ts";
import {
  auditNoteProjectLinks,
  findOrphanLinkedProjectNotes,
  resolveProjectMetadataForRecall,
} from "../shared/memory/glassStorageProjectRecall.ts";

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
    revisionCount: 1,
    rootPath: "/tmp/glass-storage/design-to-code/" + id,
  };
}

function note(id: string, linkedProjectId?: string): AletheiaNote {
  return {
    id,
    body: "Design to Code: saved.",
    category: "observation",
    source: "assistant",
    linkedProjectId,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("glassStorageProjectRecall", () => {
  test("resolveProjectMetadataForRecall returns index fields only", () => {
    const meta = resolveProjectMetadataForRecall("cap-1", [project("cap-1")]);
    assert.ok(meta);
    assert.equal(meta!.title, "Card.tsx — Design to Code");
    assert.equal(meta!.designCaptureId, "cap-1");
    assert.match(meta!.rootPath ?? "", /cap-1/);
  });

  test("auditNoteProjectLinks detects orphans", () => {
    const audits = auditNoteProjectLinks(
      [note("n1", "cap-1"), note("n2", "missing")],
      [project("cap-1")],
    );
    assert.equal(audits.length, 2);
    assert.equal(audits.find((a) => a.noteId === "n2")?.resolved, false);
    const orphans = findOrphanLinkedProjectNotes(
      [note("n1", "cap-1"), note("n2", "missing")],
      [project("cap-1")],
    );
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0]!.id, "n2");
  });
});
