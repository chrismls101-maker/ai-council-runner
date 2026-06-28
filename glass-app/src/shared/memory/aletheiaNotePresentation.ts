import type { AletheiaNote } from "../aletheiaNotes.ts";
import { categoryLabel } from "../aletheiaNotes.ts";

export type NoteFeatureId =
  | "design-to-code"
  | "research"
  | "computer-operator"
  | "writing"
  | "companion"
  | "general";

export type NoteStatusBadge = "saved" | "failed" | "warning" | "pending" | "info";

const FEATURE_LABELS: Record<NoteFeatureId, string> = {
  "design-to-code": "Design to Code",
  research: "Research",
  "computer-operator": "Computer Operator",
  writing: "Writing",
  companion: "Companion",
  general: "General",
};

const STATUS_LABELS: Record<NoteStatusBadge, string> = {
  saved: "Saved",
  failed: "Failed",
  warning: "Warning",
  pending: "In progress",
  info: "Note",
};

export function inferNoteFeature(note: AletheiaNote): NoteFeatureId {
  const body = note.body.trim();
  if (body.startsWith("Design to Code:")) return "design-to-code";
  if (note.category === "research" || note.source === "research") return "research";
  if (note.source === "loop") return "computer-operator";
  if (note.category === "preference") return "general";
  return "general";
}

export function featureDisplayLabel(feature: NoteFeatureId): string {
  return FEATURE_LABELS[feature];
}

export function statusDisplayLabel(status: NoteStatusBadge): string {
  return STATUS_LABELS[status];
}

export function inferNoteStatus(note: AletheiaNote): NoteStatusBadge | null {
  const lower = note.body.toLowerCase();
  if (
    lower.includes("generation failed")
    || lower.includes("save failed")
    || lower.includes("saving to glass storage failed")
  ) {
    return "failed";
  }
  if (lower.includes("fidelity note") || lower.includes("saved with")) {
    return "warning";
  }
  if (lower.includes("saved to glass storage") || lower.includes("saved to projects")) {
    return "saved";
  }
  if (lower.includes("still saving")) {
    return "pending";
  }
  if (note.category === "decision" || note.source === "action") {
    return "info";
  }
  return null;
}

export function noteTitle(note: AletheiaNote): string {
  const body = note.body.trim();
  if (body.startsWith("Design to Code:")) {
    const rest = body.slice("Design to Code:".length).trim();
    const dash = rest.indexOf(" — ");
    const headline = dash >= 0 ? rest.slice(0, dash).trim() : rest;
    return headline.length > 72 ? `${headline.slice(0, 69)}…` : headline;
  }
  const firstLine = body.split("\n").find((line) => line.trim())?.trim() ?? body;
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine;
}

export function noteSummary(note: AletheiaNote, maxLen = 140): string {
  const primary = note.body.trim().replace(/\s+/g, " ");
  const text = primary.length > maxLen ? `${primary.slice(0, maxLen - 1)}…` : primary;
  return text;
}

export function noteSourceLine(note: AletheiaNote): string {
  const feature = featureDisplayLabel(inferNoteFeature(note));
  const category = categoryLabel(note.category);
  const via = note.source.replace(/_/g, " ");
  return `${feature} · ${category} · ${via}`;
}

export function groupNotesByFeature(notes: readonly AletheiaNote[]): Map<NoteFeatureId, AletheiaNote[]> {
  const map = new Map<NoteFeatureId, AletheiaNote[]>();
  for (const note of notes) {
    const feature = inferNoteFeature(note);
    const bucket = map.get(feature) ?? [];
    bucket.push(note);
    map.set(feature, bucket);
  }
  return map;
}

export function filterNotesByFeature(
  notes: readonly AletheiaNote[],
  feature: NoteFeatureId | "all",
): AletheiaNote[] {
  if (feature === "all") return [...notes];
  return notes.filter((note) => inferNoteFeature(note) === feature);
}

export function sortNotesByRecency(notes: readonly AletheiaNote[]): AletheiaNote[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function noteFeatureFilterOptions(
  notes: readonly AletheiaNote[],
): Array<{ id: NoteFeatureId | "all"; label: string; count: number }> {
  const grouped = groupNotesByFeature(notes);
  const options: Array<{ id: NoteFeatureId | "all"; label: string; count: number }> = [
    { id: "all", label: "All features", count: notes.length },
  ];
  for (const id of Object.keys(FEATURE_LABELS) as NoteFeatureId[]) {
    const count = grouped.get(id)?.length ?? 0;
    if (count > 0) {
      options.push({ id, label: FEATURE_LABELS[id], count });
    }
  }
  return options;
}

export function formatNoteTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatLinkedProjectId(projectId: string): string {
  const trimmed = projectId.trim();
  if (trimmed.length <= 28) return trimmed;
  return `${trimmed.slice(0, 12)}…${trimmed.slice(-10)}`;
}

/** Human-readable category + source for metadata panels. */
export function noteCategorySourceLabels(note: AletheiaNote): {
  categoryLabel: string;
  source: AletheiaNote["source"];
} {
  return {
    categoryLabel: categoryLabel(note.category),
    source: note.source,
  };
}
