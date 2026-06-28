import type { DesignToCodeSession } from "./designToCodeTypes.ts";
import { DESIGN_STACK_LABELS, DESIGN_TO_CODE_ACTION_LABELS } from "./designStackRegistry.ts";

const RECENT_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 3;

export type DesignToCodeAletheiaEvent =
  | "generation_failed"
  | "save_succeeded"
  | "save_failed";

export function isAletheiaDiagnosticPrompt(prompt: string): boolean {
  const lower = prompt.trim().toLowerCase();
  return (
    /\bwhat happened\b/.test(lower)
    || /\bwhat went wrong\b/.test(lower)
    || /\bwhy did\b.*\bfail/.test(lower)
    || /\bwhat failed\b/.test(lower)
    || /\bwhy didn't\b/.test(lower)
    || /\btell me what happened\b/.test(lower)
  );
}

function sessionActionLabel(session: DesignToCodeSession): string {
  const action = session.selectedAction ?? session.pendingAction;
  if (!action) return "Design to Code";
  const stack = session.selectedStack;
  const base = DESIGN_TO_CODE_ACTION_LABELS[action];
  if (action === "react" && stack) {
    return `${base} (${DESIGN_STACK_LABELS[stack]})`;
  }
  return base;
}

function sessionStatusSummary(session: DesignToCodeSession): string {
  if (session.glassProjectSaveStatus === "failed") {
    return session.glassProjectSaveError
      ? `save failed — ${session.glassProjectSaveError}`
      : "save to Glass Storage failed";
  }
  if (session.glassProjectSaveStatus === "saved") {
    if (session.latestWarnings?.length) {
      return `saved to Projects with ${session.latestWarnings.length} fidelity note(s)`;
    }
    return "saved to Glass Storage → Projects";
  }
  if (session.glassProjectSaveStatus === "pending") {
    return "still saving to Glass Storage";
  }
  if (session.phase === "failed") {
    return session.statusLine ?? "generation failed";
  }
  if (session.phase === "done") {
    return "generation finished";
  }
  if (session.statusLine) {
    return session.statusLine;
  }
  return `phase: ${session.phase}`;
}

export function formatDesignToCodeAskContext(
  captures: Record<string, Omit<DesignToCodeSession, "id">> | undefined,
  now = Date.now(),
): string | undefined {
  if (!captures) return undefined;

  const recent = Object.values(captures)
    .filter((s) => now - s.createdAt <= RECENT_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_SESSIONS);

  if (!recent.length) return undefined;

  const lines = recent.map((session) => {
    const file = session.detectedFile?.fileName;
    const where = file
      ? ` for ${file}`
      : session.activeApp
        ? ` from ${session.activeApp}`
        : "";
    return `- ${sessionActionLabel(session)}${where}: ${sessionStatusSummary(session)}`;
  });

  return [
    "Recent Design to Code activity (on-device — use when the user asks what happened):",
    ...lines,
  ].join("\n");
}

export function buildDesignToCodeAletheiaNote(input: {
  event: DesignToCodeAletheiaEvent;
  session: DesignToCodeSession;
  error?: string;
}): { body: string; rationale?: string; linkedProjectId?: string } {
  const action = sessionActionLabel(input.session);
  const file = input.session.detectedFile?.fileName;
  const target = file ? ` (${file})` : "";
  const projectId = input.session.glassProjectId ?? input.session.feedItemId;

  switch (input.event) {
    case "generation_failed":
      return {
        body: `Design to Code: ${action}${target} — generation failed.`,
        rationale: input.session.statusLine ?? input.error,
      };
    case "save_failed":
      return {
        body: `Design to Code: ${action}${target} — result generated but saving to Glass Storage failed.`,
        rationale: input.error ?? input.session.glassProjectSaveError,
        linkedProjectId: projectId,
      };
    case "save_succeeded":
      return {
        body: `Design to Code: ${action}${target} — saved to Glass Storage under Projects.`,
        rationale: input.session.latestWarnings?.length
          ? `Fidelity notes: ${input.session.latestWarnings.slice(0, 2).join("; ")}`
          : undefined,
        linkedProjectId: projectId,
      };
  }
}

export function filterRecentDesignToCodeNotes<T extends { body: string; updatedAt: number }>(
  notes: readonly T[],
  now = Date.now(),
  limit = 3,
  maxAgeMs: number | null = RECENT_MS,
): T[] {
  const cutoff = maxAgeMs == null ? 0 : now - maxAgeMs;
  return notes
    .filter((n) => n.body.startsWith("Design to Code:") && n.updatedAt >= cutoff)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
