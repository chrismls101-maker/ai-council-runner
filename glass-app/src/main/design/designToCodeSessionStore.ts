import type { GlassState } from "../../shared/ipc.ts";
import type {
  DesignStack,
  DesignToCodeAction,
  DesignToCodeSession,
} from "../../shared/designToCode.ts";
import { DEFAULT_DESIGN_STACK } from "../../shared/designToCode.ts";

export type DesignCapturesState = NonNullable<GlassState["designCaptures"]>;

export function getDesignSession(
  state: { designCaptures?: DesignCapturesState },
  feedItemId: string,
): DesignToCodeSession | null {
  const raw = state.designCaptures?.[feedItemId];
  if (!raw) return null;
  return migrateSession(raw, feedItemId);
}

export function migrateSession(
  raw: DesignCapturesState[string],
  feedItemId: string,
): DesignToCodeSession {
  return {
    id: feedItemId,
    feedItemId: raw.feedItemId,
    imageDataUrl: raw.imageDataUrl,
    createdAt: raw.createdAt ?? Date.now(),
    activeApp: raw.activeApp,
    activeWindowTitle: raw.activeWindowTitle,
    detectedEditor: raw.detectedEditor,
    detectedFile: raw.detectedFile,
    selectedStack: raw.selectedStack ?? DEFAULT_DESIGN_STACK,
    selectedAction: raw.selectedAction,
    quality: raw.quality,
    screenSpec: raw.screenSpec,
    codebaseStylePack: raw.codebaseStylePack,
    latestPrompt: raw.latestPrompt,
    latestResult: raw.latestResult,
    latestWarnings: raw.latestWarnings,
    latestResponseFeedItemId: raw.latestResponseFeedItemId,
    qualityAcknowledged: raw.qualityAcknowledged,
    refinementHistory: raw.refinementHistory ?? [],
    phase: raw.phase === "permission" ? "awaiting_permission" : raw.phase,
    pendingAction: raw.pendingAction,
    pendingRefinementFeedback: raw.pendingRefinementFeedback,
    statusLine: raw.statusLine,
    fileReadGranted: raw.fileReadGranted,
    glassProjectId: raw.glassProjectId,
    glassProjectSaveStatus: raw.glassProjectSaveStatus,
    glassProjectSaveError: raw.glassProjectSaveError,
  };
}

export function writeDesignSession(
  state: { designCaptures?: DesignCapturesState },
  session: DesignToCodeSession,
): void {
  if (!state.designCaptures) state.designCaptures = {};
  state.designCaptures[session.feedItemId] = {
    feedItemId: session.feedItemId,
    imageDataUrl: session.imageDataUrl,
    createdAt: session.createdAt,
    activeApp: session.activeApp,
    activeWindowTitle: session.activeWindowTitle,
    detectedEditor: session.detectedEditor,
    detectedFile: session.detectedFile,
    selectedStack: session.selectedStack,
    selectedAction: session.selectedAction,
    quality: session.quality,
    screenSpec: session.screenSpec,
    codebaseStylePack: session.codebaseStylePack,
    latestPrompt: session.latestPrompt,
    latestResult: session.latestResult,
    latestWarnings: session.latestWarnings,
    latestResponseFeedItemId: session.latestResponseFeedItemId,
    qualityAcknowledged: session.qualityAcknowledged,
    refinementHistory: session.refinementHistory,
    phase: session.phase,
    pendingAction: session.pendingAction,
    pendingRefinementFeedback: session.pendingRefinementFeedback,
    statusLine: session.statusLine,
    fileReadGranted: session.fileReadGranted,
    glassProjectId: session.glassProjectId,
    glassProjectSaveStatus: session.glassProjectSaveStatus,
    glassProjectSaveError: session.glassProjectSaveError,
  };
}

export function patchDesignSession(
  state: { designCaptures?: DesignCapturesState },
  feedItemId: string,
  patch: Partial<DesignToCodeSession>,
): DesignToCodeSession | null {
  const current = getDesignSession(state, feedItemId);
  if (!current) return null;
  const next = { ...current, ...patch };
  writeDesignSession(state, next);
  return next;
}

export function appendRefinement(
  state: { designCaptures?: DesignCapturesState },
  feedItemId: string,
  text: string,
): void {
  const session = getDesignSession(state, feedItemId);
  if (!session) return;
  session.refinementHistory = [
    ...session.refinementHistory,
    { text, createdAt: Date.now() },
  ];
  writeDesignSession(state, session);
}

export function resolveStack(
  state: { glassSettings?: { designStack?: DesignStack } },
  session?: DesignToCodeSession | null,
): DesignStack {
  // Live picker (glassSettings) wins over the snapshot taken at capture time.
  return (
    state.glassSettings?.designStack
    ?? session?.selectedStack
    ?? DEFAULT_DESIGN_STACK
  );
}

export function logDesignPhase(feedItemId: string, phase: string, detail?: string): void {
  console.log(
    `[DesignToCode] ${feedItemId} → ${phase}${detail ? `: ${detail}` : ""}`,
  );
}

export type DesignGenerateCommand = {
  feedItemId: string;
  action: DesignToCodeAction;
  refinementFeedback?: string;
};
