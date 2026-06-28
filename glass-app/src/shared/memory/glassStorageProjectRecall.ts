import type { AletheiaNote } from "../aletheiaNotes.ts";
import type { GlassProjectRecord } from "../glassStorageProjectTypes.ts";

/** Lightweight project metadata for Aletheia recall — index fields only, no artifacts. */
export type GlassProjectRecallMetadata = {
  id: string;
  title: string;
  source: string;
  status: GlassProjectRecord["status"];
  action?: GlassProjectRecord["action"];
  stack?: GlassProjectRecord["stack"];
  detectedFileName?: string;
  warningSummary?: string;
  saveError?: string;
  revisionCount?: number;
  updatedAt: number;
  rootPath?: string;
  designCaptureId: string;
};

export type NoteProjectLinkAudit = {
  noteId: string;
  linkedProjectId: string;
  resolved: boolean;
};

export function resolveProjectMetadataForRecall(
  projectId: string,
  projects: readonly GlassProjectRecord[],
): GlassProjectRecallMetadata | null {
  const trimmed = projectId.trim();
  if (!trimmed) return null;
  const record = projects.find((p) => p.id === trimmed);
  if (!record) return null;
  return {
    id: record.id,
    title: record.title,
    source: record.source,
    status: record.status,
    action: record.action,
    stack: record.stack,
    detectedFileName: record.detectedFileName,
    warningSummary: record.warningSummary,
    saveError: record.saveError,
    revisionCount: record.revisionCount,
    updatedAt: record.updatedAt,
    rootPath: record.rootPath,
    designCaptureId: record.designCaptureId,
  };
}

export function auditNoteProjectLinks(
  notes: readonly AletheiaNote[],
  projects: readonly GlassProjectRecord[],
): NoteProjectLinkAudit[] {
  const projectIds = new Set(projects.map((p) => p.id));
  const results: NoteProjectLinkAudit[] = [];
  for (const note of notes) {
    const linked = note.linkedProjectId?.trim();
    if (!linked) continue;
    results.push({
      noteId: note.id,
      linkedProjectId: linked,
      resolved: projectIds.has(linked),
    });
  }
  return results;
}

export function findOrphanLinkedProjectNotes(
  notes: readonly AletheiaNote[],
  projects: readonly GlassProjectRecord[],
): AletheiaNote[] {
  const audits = auditNoteProjectLinks(notes, projects);
  const orphanIds = new Set(
    audits.filter((a) => !a.resolved).map((a) => a.noteId),
  );
  return notes.filter((n) => orphanIds.has(n.id));
}
