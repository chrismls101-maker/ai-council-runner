import type { AletheiaNote } from "../aletheiaNotes.ts";
import type { GlassProjectRecord } from "../glassStorageProjectTypes.ts";
import type { DesignToCodeSession } from "../design/designToCodeTypes.ts";
import {
  filterRecentDesignToCodeNotes,
  formatDesignToCodeAskContext,
  isAletheiaDiagnosticPrompt,
} from "../design/designToCodeAletheiaContext.ts";
import {
  buildDesignToCodeProjectRecallAskContext,
  isDesignToCodeRecallPrompt,
} from "../design/designToCodeProjectRecall.ts";
import { formatAletheiaNotesContext, selectRelevantAletheiaNotes } from "../aletheiaNotes.ts";

export type DesignCapturesState = Record<string, Omit<DesignToCodeSession, "id">> | undefined;

export interface ResolveAletheiaDiagnosticContextInput {
  prompt: string;
  companionModeActive: boolean;
  notes?: readonly AletheiaNote[];
  projects?: readonly GlassProjectRecord[];
  captures?: DesignCapturesState;
  latestProjectId?: string | null;
  now?: number;
}

/**
 * Unified Design to Code + diagnostic recall for asks.
 * D2C notes and project metadata are injected for recall/diagnostic prompts
 * without requiring companion mode.
 */
export function resolveAletheiaDiagnosticContext(
  input: ResolveAletheiaDiagnosticContextInput,
): string | undefined {
  const now = input.now ?? Date.now();
  const parts: string[] = [];

  const recallOrDiagnostic =
    isDesignToCodeRecallPrompt(input.prompt) || isAletheiaDiagnosticPrompt(input.prompt);

  if (recallOrDiagnostic && input.notes?.length) {
    const d2cNotes = filterRecentDesignToCodeNotes(input.notes, now, 5, null);
    const notesContext = formatAletheiaNotesContext(d2cNotes);
    if (notesContext) parts.push(notesContext);
  }

  const projectRecall = buildDesignToCodeProjectRecallAskContext({
    prompt: input.prompt,
    latestProjectId: input.latestProjectId,
    notes: input.notes,
    captures: input.captures,
    projects: input.projects,
  });
  if (projectRecall) parts.push(projectRecall);

  const liveActivity = formatDesignToCodeAskContext(input.captures, now);
  if (liveActivity) parts.push(liveActivity);

  if (input.companionModeActive && input.notes?.length && !recallOrDiagnostic) {
    const notes = selectRelevantAletheiaNotes(input.notes, input.prompt);
    const notesContext = formatAletheiaNotesContext(notes);
    if (notesContext) parts.unshift(notesContext);
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
