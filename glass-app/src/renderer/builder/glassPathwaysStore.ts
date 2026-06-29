import type {
  Pathway,
  PathwayLiveSession,
  Stage,
  Step,
  WorkflowEvent,
} from "../../shared/glassPathwaysTypes.ts";
import { ensureCanonicalPathway } from "../../shared/glassPathwaysMigration.ts";
import { defaultPathwayCapabilities } from "../../shared/glassPathwaysDefaults.ts";
import { derivePathwayDisplayStatus, normalizePathwayStatus } from "../../shared/glassPathwaysProgress.ts";
import {
  createExecutionReceipt,
  dispatchPathwayEvent,
} from "../../shared/glassPathwaysWorkflow.ts";
import { createPathwayId } from "../../shared/glassPathwaysDefaults.ts";

const STORAGE_KEY = "glass:pathways:v2";
const LEGACY_STORAGE_KEY = "glass:pathways:v1";

export interface GlassPathwaysStore {
  pathways: Pathway[];
  activePathwayId: string | null;
  selectedStageId: string | null;
  selectedStepId: string | null;
  liveSession: PathwayLiveSession | null;
}

function defaultStore(): GlassPathwaysStore {
  return {
    pathways: [],
    activePathwayId: null,
    selectedStageId: null,
    selectedStepId: null,
    liveSession: null,
  };
}

function normalizePathway(pathway: Pathway): Pathway {
  return normalizePathwayStatus({
    ...pathway,
    audit: Array.isArray(pathway.audit) ? pathway.audit : [],
    checkpoints: Array.isArray(pathway.checkpoints) ? pathway.checkpoints : [],
    steps: Array.isArray(pathway.steps) ? pathway.steps : [],
    context: pathway.context ?? {
      userGoal: pathway.goal,
      currentNarrative: pathway.summary,
      domainFacts: {},
      decisionsMade: [],
      openQuestions: [],
      knownCredentials: [],
      linkedApps: [],
      discoveredResources: [],
      artifacts: [],
      notes: [],
    },
    capabilities: pathway.capabilities ?? defaultPathwayCapabilities(),
    pendingGate: pathway.pendingGate ?? null,
    pendingHandoff: pathway.pendingHandoff ?? null,
  });
}

function normalizeLoadedStore(parsed: GlassPathwaysStore): GlassPathwaysStore {
  const pathways = parsed.pathways
    .map((p) => ensureCanonicalPathway(p))
    .filter((p): p is Pathway => p != null)
    .map(normalizePathway);

  let activePathwayId = parsed.activePathwayId ?? null;
  if (activePathwayId && !pathways.some((p) => p.id === activePathwayId)) {
    activePathwayId = pathways[0]?.id ?? null;
  }

  const activePathway = activePathwayId
    ? pathways.find((p) => p.id === activePathwayId)
    : null;

  let selectedStageId = parsed.selectedStageId ?? null;
  if (selectedStageId && !activePathway?.stages.some((s) => s.id === selectedStageId)) {
    selectedStageId = null;
  }

  let selectedStepId = parsed.selectedStepId ?? null;
  if (selectedStepId && !activePathway?.steps.some((s) => s.id === selectedStepId)) {
    selectedStepId = null;
  }

  let liveSession = parsed.liveSession ?? null;
  if (liveSession) {
    const sessionPathway = pathways.find((p) => p.id === liveSession!.pathwayId);
    const hasStage = sessionPathway?.stages.some((s) => s.id === liveSession!.stageId);
    if (!sessionPathway || !hasStage) liveSession = null;
  }

  return {
    pathways,
    activePathwayId,
    selectedStageId,
    selectedStepId,
    liveSession,
  };
}

function loadLegacyStore(): GlassPathwaysStore | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { pathways?: unknown[] } & Partial<GlassPathwaysStore>;
    if (!parsed || !Array.isArray(parsed.pathways)) return null;
    const migrated: GlassPathwaysStore = {
      pathways: parsed.pathways
        .map((p) => ensureCanonicalPathway(p))
        .filter((p): p is Pathway => p != null),
      activePathwayId: parsed.activePathwayId ?? null,
      selectedStageId: parsed.selectedStageId ?? null,
      selectedStepId: null,
      liveSession: parsed.liveSession ?? null,
    };
    return normalizeLoadedStore(migrated);
  } catch {
    return null;
  }
}

export function loadPathwaysStore(): GlassPathwaysStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = loadLegacyStore();
      if (legacy) {
        savePathwaysStore(legacy);
        return legacy;
      }
      return defaultStore();
    }
    const parsed = JSON.parse(raw) as GlassPathwaysStore;
    if (!parsed || !Array.isArray(parsed.pathways)) return defaultStore();
    return normalizeLoadedStore(parsed);
  } catch {
    return defaultStore();
  }
}

export function savePathwaysStore(store: GlassPathwaysStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage full or unavailable
  }
}

function updatePathwayInStore(
  store: GlassPathwaysStore,
  pathwayId: string,
  updater: (pathway: Pathway) => Pathway,
): GlassPathwaysStore {
  const pathways = store.pathways.map((p) =>
    p.id === pathwayId ? normalizePathway(updater(p)) : p,
  );
  return { ...store, pathways };
}

function applyPathwayEvent(
  store: GlassPathwaysStore,
  pathwayId: string,
  event: WorkflowEvent,
): GlassPathwaysStore {
  return updatePathwayInStore(store, pathwayId, (pathway) =>
    dispatchPathwayEvent(pathway, event),
  );
}

export const GLASS_PATHWAYS_MAX_SAVED = 12;

export function addPathway(store: GlassPathwaysStore, pathway: Pathway): GlassPathwaysStore {
  const normalized = normalizePathway(pathway);
  const withoutDup = store.pathways.filter((p) => p.id !== normalized.id);
  const pathways = [normalized, ...withoutDup].slice(0, GLASS_PATHWAYS_MAX_SAVED);
  return {
    ...store,
    pathways,
    activePathwayId: normalized.id,
    selectedStageId: null,
    selectedStepId: null,
  };
}

export function upsertPathway(store: GlassPathwaysStore, pathway: Pathway): GlassPathwaysStore {
  const existing = store.pathways.findIndex((p) => p.id === pathway.id);
  if (existing < 0) return addPathway(store, pathway);
  const normalized = normalizePathway(pathway);
  const pathways = store.pathways.map((p, i) => (i === existing ? normalized : p));
  return {
    ...store,
    pathways,
    activePathwayId: normalized.id,
    selectedStageId: null,
    selectedStepId: null,
  };
}

export function switchActivePathway(
  store: GlassPathwaysStore,
  pathwayId: string,
): GlassPathwaysStore {
  if (!store.pathways.some((p) => p.id === pathwayId)) return store;
  let next = store;
  if (store.liveSession && store.liveSession.pathwayId !== pathwayId) {
    next = finalizePathwayLiveSession(store, "abandoned");
  }
  return {
    ...next,
    activePathwayId: pathwayId,
    selectedStageId: null,
    selectedStepId: null,
  };
}

export function beginNewPathwayDraft(store: GlassPathwaysStore): GlassPathwaysStore {
  return {
    ...store,
    activePathwayId: null,
    selectedStageId: null,
    selectedStepId: null,
  };
}

export function removePathway(store: GlassPathwaysStore, pathwayId: string): GlassPathwaysStore {
  const pathways = store.pathways.filter((p) => p.id !== pathwayId);
  let activePathwayId = store.activePathwayId;
  if (activePathwayId === pathwayId) {
    activePathwayId = pathways[0]?.id ?? null;
  }
  let liveSession = store.liveSession;
  if (liveSession?.pathwayId === pathwayId) liveSession = null;
  return {
    ...store,
    pathways,
    activePathwayId,
    selectedStageId: null,
    selectedStepId: null,
    liveSession,
  };
}

function liveSessionToReceipt(
  session: PathwayLiveSession,
  outcome: "started" | "ended" | "abandoned",
): ReturnType<typeof createExecutionReceipt> {
  const kindMap = {
    escort: outcome === "started" ? "step_started" as const : "step_completed" as const,
    privacy:
      outcome === "started" ? "privacy_handoff_entered" as const : "privacy_handoff_resumed" as const,
    execution:
      outcome === "started" ? "operator_started" as const : "operator_completed" as const,
    connector: outcome === "started" ? "step_started" as const : "step_completed" as const,
    observe: outcome === "started" ? "step_started" as const : "step_completed" as const,
  };
  return createExecutionReceipt({
    pathwayId: session.pathwayId,
    stageId: session.stageId,
    stepId: session.stepId,
    kind: kindMap[session.mode],
    summary:
      outcome === "abandoned"
        ? `Session abandoned (${session.mode})`
        : `${session.mode} session ${outcome}`,
    metadata: {
      mode: session.mode,
      targetLabel: session.targetLabel,
      outcome,
    },
  });
}

export function finalizePathwayLiveSession(
  store: GlassPathwaysStore,
  outcome: "ended" | "abandoned" = "ended",
): GlassPathwaysStore {
  const session = store.liveSession;
  if (!session) return store;
  const receipt = liveSessionToReceipt(
    session,
    outcome === "abandoned" ? "abandoned" : "ended",
  );
  const next = updatePathwayInStore(store, session.pathwayId, (pathway) => {
    // Privacy audit is owned by PRIVACY_HANDOFF_* workflow events — avoid duplicate receipts.
    if (session.mode === "privacy") {
      return pathway;
    }
    return {
      ...pathway,
      audit: [...pathway.audit, receipt].slice(-80),
    };
  });
  return { ...next, liveSession: null };
}

export function beginPathwayLiveSession(
  store: GlassPathwaysStore,
  session: Omit<PathwayLiveSession, "startedAt">,
): GlassPathwaysStore {
  let next = store;
  if (
    store.liveSession
    && (store.liveSession.pathwayId !== session.pathwayId
      || store.liveSession.stageId !== session.stageId
      || store.liveSession.mode !== session.mode)
  ) {
    next = finalizePathwayLiveSession(store, "abandoned");
  }

  const startedAt = new Date().toISOString();
  const fullSession = { ...session, startedAt };

  next = updatePathwayInStore(next, session.pathwayId, (pathway) => {
    // Privacy handoff receipts come from PRIVACY_HANDOFF_ENTER — live session is UI-only bridge.
    if (session.mode === "privacy") {
      return pathway;
    }
    const receipt = liveSessionToReceipt(fullSession, "started");
    return {
      ...pathway,
      audit: [...pathway.audit, receipt].slice(-80),
    };
  });

  return { ...next, liveSession: fullSession };
}

export function endPathwayLiveSession(store: GlassPathwaysStore): GlassPathwaysStore {
  return finalizePathwayLiveSession(store, "ended");
}

export function selectStage(store: GlassPathwaysStore, stageId: string | null): GlassPathwaysStore {
  return { ...store, selectedStageId: stageId, selectedStepId: null };
}

export function selectStep(store: GlassPathwaysStore, stepId: string | null): GlassPathwaysStore {
  return { ...store, selectedStepId: stepId };
}

export function markStageActive(
  store: GlassPathwaysStore,
  pathwayId: string,
  stageId: string,
): GlassPathwaysStore {
  return applyPathwayEvent(store, pathwayId, {
    type: "STAGE_START",
    pathwayId,
    stageId,
  });
}

export function markStageComplete(
  store: GlassPathwaysStore,
  pathwayId: string,
  stageId: string,
): GlassPathwaysStore {
  const pathway = store.pathways.find((p) => p.id === pathwayId);
  if (!pathway) return store;

  let next = store;
  const pendingSteps = pathway.steps.filter(
    (s) => s.stageId === stageId && s.status !== "completed",
  );
  for (const step of pendingSteps) {
    next = applyPathwayEvent(next, pathwayId, {
      type: "STEP_COMPLETE",
      pathwayId,
      stageId,
      stepId: step.id,
    });
  }

  const updatedPathway = next.pathways.find((p) => p.id === pathwayId);
  const stage = updatedPathway?.stages.find((s) => s.id === stageId);
  if (
    stage
    && stage.status !== "completed"
    && updatedPathway!.steps
      .filter((s) => s.stageId === stageId)
      .every((s) => s.status === "completed")
  ) {
    next = updatePathwayInStore(next, pathwayId, (p) => ({
      ...p,
      stages: p.stages.map((s) =>
        s.id === stageId ? { ...s, status: "completed" as const, completedAt: new Date().toISOString() } : s,
      ),
      status: p.stages.every((s) => s.id === stageId || s.status === "completed") ? "completed" : p.status,
    }));
  }

  if (next.liveSession?.pathwayId === pathwayId && next.liveSession.stageId === stageId) {
    next = finalizePathwayLiveSession(next, "ended");
  }

  return next;
}

export function markStepComplete(
  store: GlassPathwaysStore,
  pathwayId: string,
  stageId: string,
  stepId: string,
): GlassPathwaysStore {
  return applyPathwayEvent(store, pathwayId, {
    type: "STEP_COMPLETE",
    pathwayId,
    stageId,
    stepId,
  });
}

export function addPathwayCheckpoint(
  store: GlassPathwaysStore,
  pathwayId: string,
  stageId: string,
  note?: string,
): GlassPathwaysStore {
  const pathway = store.pathways.find((p) => p.id === pathwayId);
  const stepId = pathway?.currentStepId
    ?? pathway?.steps.find((s) => s.stageId === stageId)?.id;

  return applyPathwayEvent(store, pathwayId, {
    type: "CHECKPOINT_CREATE",
    pathwayId,
    stageId,
    stepId: stepId ?? undefined,
    reason: "manual_pause",
    note,
  });
}

export function pausePathway(store: GlassPathwaysStore, pathwayId: string): GlassPathwaysStore {
  return applyPathwayEvent(store, pathwayId, { type: "PATHWAY_PAUSE", pathwayId });
}

export function resumePathway(store: GlassPathwaysStore, pathwayId: string): GlassPathwaysStore {
  return applyPathwayEvent(store, pathwayId, { type: "PATHWAY_RESUME", pathwayId });
}

export function enterPrivacyHandoff(
  store: GlassPathwaysStore,
  pathwayId: string,
  stageId: string,
  stepId: string,
  reason: string,
  expectedUserTask: string,
): GlassPathwaysStore {
  const handoff = {
    id: createPathwayId("handoff"),
    pathwayId,
    stageId,
    stepId,
    reason,
    suspendObservation: true,
    suspendActions: true,
    expectedUserTask,
    resumePhrases: ["I'm ready", "Come back"],
    state: "pending" as const,
    enteredAt: new Date().toISOString(),
  };
  return applyPathwayEvent(store, pathwayId, {
    type: "PRIVACY_HANDOFF_ENTER",
    handoff,
  });
}

export function resumePrivacyHandoff(
  store: GlassPathwaysStore,
  pathwayId: string,
  handoffId: string,
  trigger: "manual_resume_button" | "voice_phrase" | "explicit_text_reply" = "manual_resume_button",
): GlassPathwaysStore {
  return applyPathwayEvent(store, pathwayId, {
    type: "PRIVACY_HANDOFF_RESUME",
    handoffId,
    trigger,
  });
}

export function toggleStageSubstep(
  store: GlassPathwaysStore,
  pathwayId: string,
  stageId: string,
  substepIndex: number,
): GlassPathwaysStore {
  const pathway = store.pathways.find((p) => p.id === pathwayId);
  if (!pathway) return store;
  const stage = pathway.stages.find((s) => s.id === stageId);
  if (!stage) return store;
  const stepId = stage.stepIds[substepIndex];
  if (!stepId) return store;
  const step = pathway.steps.find((s) => s.id === stepId);
  if (!step) return store;

  if (step.status === "completed") {
    return store;
  }

  return markStepComplete(store, pathwayId, stageId, stepId);
}

export function getActivePathway(store: GlassPathwaysStore): Pathway | null {
  if (!store.activePathwayId) return null;
  return store.pathways.find((p) => p.id === store.activePathwayId) ?? null;
}

export function getSelectedStage(
  pathway: Pathway | null,
  selectedStageId: string | null,
): Stage | null {
  if (!pathway || !selectedStageId) return null;
  return pathway.stages.find((s) => s.id === selectedStageId) ?? null;
}

export function getSelectedStep(
  pathway: Pathway | null,
  selectedStepId: string | null,
): Step | null {
  if (!pathway || !selectedStepId) return null;
  return pathway.steps.find((s) => s.id === selectedStepId) ?? null;
}

export function dispatchStorePathwayEvent(
  store: GlassPathwaysStore,
  pathwayId: string,
  event: WorkflowEvent,
): GlassPathwaysStore {
  return applyPathwayEvent(store, pathwayId, event);
}
