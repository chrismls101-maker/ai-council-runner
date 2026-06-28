import type { GlassProjectRecord } from "../glassStorageProjectTypes.ts";
import type { AletheiaNote } from "../aletheiaNotes.ts";
import type { DesignToCodeSession } from "./designToCodeTypes.ts";
import {
  DESIGN_STACK_LABELS,
  DESIGN_TO_CODE_ACTION_LABELS,
} from "./designStackRegistry.ts";
import {
  filterRecentDesignToCodeNotes,
  isAletheiaDiagnosticPrompt,
} from "./designToCodeAletheiaContext.ts";

/** User is asking about a recent Design to Code run or saved project. */
export function isDesignToCodeRecallPrompt(prompt: string): boolean {
  if (isAletheiaDiagnosticPrompt(prompt)) return true;
  const lower = prompt.trim().toLowerCase();
  return (
    /\bwhat did you save\b/.test(lower)
    || /\bwhere did you save\b/.test(lower)
    || /\b(last|recent|latest)\b.*\b(design to code|design-to-code)\b/.test(lower)
    || /\b(design to code|design-to-code)\b.*\b(last|recent|latest)\b/.test(lower)
    || /\bshow me\b.*\b(design to code|saved project|glass storage)\b/.test(lower)
    || /\bglass storage\b.*\bprojects\b/.test(lower)
  );
}

export function collectDesignToCodeRecallProjectIds(input: {
  latestProjectId?: string | null;
  notes?: readonly AletheiaNote[];
  captures?: Record<string, Omit<DesignToCodeSession, "id">>;
  limit?: number;
}): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  const push = (id: string | undefined | null): void => {
    const trimmed = id?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    ids.push(trimmed);
  };

  push(input.latestProjectId);

  if (input.notes?.length) {
    for (const note of filterRecentDesignToCodeNotes(input.notes, Date.now(), 5, null)) {
      push(note.linkedProjectId);
    }
  }

  if (input.captures) {
    const captureSessions = Object.values(input.captures)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 3);
    for (const session of captureSessions) {
      push(session.glassProjectId ?? session.feedItemId);
    }
  }

  return ids.slice(0, input.limit ?? 3);
}

function projectStatusLine(record: GlassProjectRecord): string {
  if (record.status === "failed") {
    return record.saveError
      ? `save incomplete — ${record.saveError}`
      : "save incomplete";
  }
  if (record.status === "warning") {
    return record.warningSummary
      ? `saved with fidelity notes — ${record.warningSummary}`
      : "saved with fidelity notes";
  }
  return "saved in Glass Storage → Projects";
}

function formatProjectRecallLine(record: GlassProjectRecord): string {
  const action = record.action ? DESIGN_TO_CODE_ACTION_LABELS[record.action] : "Design to Code";
  const stack = record.stack ? DESIGN_STACK_LABELS[record.stack] : null;
  const parts = [
    `projectId=${record.id}`,
    `title="${record.title}"`,
    action,
    stack,
    record.detectedFileName ? `file=${record.detectedFileName}` : null,
    projectStatusLine(record),
    record.revisionCount ? `${record.revisionCount} revision(s)` : null,
    "location=Glass Storage → Projects",
  ].filter(Boolean);
  return `- ${parts.join(" · ")}`;
}

/**
 * Metadata-only recall for Aletheia — no code files or screenshots.
 */
export function formatDesignToCodeProjectRecallContext(
  projectIds: string[],
  projects: readonly GlassProjectRecord[],
): string | undefined {
  if (!projectIds.length || !projects.length) return undefined;

  const byId = new Map(projects.map((p) => [p.id, p]));
  const lines: string[] = [];
  for (const id of projectIds) {
    const record = byId.get(id);
    if (record) lines.push(formatProjectRecallLine(record));
  }

  if (!lines.length) return undefined;

  return [
    "Design to Code — linked Glass Storage project metadata (breadcrumb → Projects):",
    ...lines,
    "Full artifacts (code, capture, files) live in Projects; open there if the user wants the output.",
  ].join("\n");
}

export function buildDesignToCodeProjectRecallAskContext(input: {
  prompt: string;
  latestProjectId?: string | null;
  notes?: readonly AletheiaNote[];
  captures?: Record<string, Omit<DesignToCodeSession, "id">>;
  projects?: readonly GlassProjectRecord[];
}): string | undefined {
  if (!isDesignToCodeRecallPrompt(input.prompt)) return undefined;
  const projectIds = collectDesignToCodeRecallProjectIds({
    latestProjectId: input.latestProjectId,
    notes: input.notes,
    captures: input.captures,
  });
  return formatDesignToCodeProjectRecallContext(projectIds, input.projects ?? []);
}
