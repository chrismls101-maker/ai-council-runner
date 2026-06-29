import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatPathwayGenerateError } from "../../shared/glassPathwaysProgress.ts";
import { resolveFocusStage } from "../../shared/glassPathwaysGuidance.ts";
import type { PathwayEscortTarget } from "../../shared/glassPathwaysEscort.ts";
import type { PathwayConnectorMatch } from "../../shared/glassPathwaysConnectors.ts";
import { prepareGlassTextPointerDown, armGlassSpacesOverlayPointer } from "../glassTextInteraction.ts";
import {
  addPathway,
  addPathwayCheckpoint,
  beginNewPathwayDraft,
  beginPathwayLiveSession,
  endPathwayLiveSession,
  enterPrivacyHandoff,
  getActivePathway,
  getSelectedStage,
  loadPathwaysStore,
  markStageActive,
  markStageComplete,
  removePathway,
  resumePrivacyHandoff,
  savePathwaysStore,
  selectStage,
  switchActivePathway,
  toggleStageSubstep,
  type GlassPathwaysStore,
} from "./glassPathwaysStore.ts";
import { resolveFocusStep } from "../../shared/glassPathwaysGuidance.ts";
import { GlassPathwayGuidanceCard } from "./GlassPathwayGuidanceCard.tsx";
import { GlassPathwayHeader } from "./GlassPathwayHeader.tsx";
import { GlassPathwayRuntimePanel } from "./GlassPathwayRuntimePanel.tsx";
import { GlassPathwaysSavedList } from "./GlassPathwaysSavedList.tsx";
import { GlassPathwayStageDetail } from "./GlassPathwayStageDetail.tsx";
import { GlassPathwayStageList } from "./GlassPathwayStageList.tsx";
import "./GlassPathwaysView.css";

type GenerateState = "idle" | "loading" | "error";

function PathwaysShell({
  store,
  draftMode,
  layout,
  theme,
  savedListOpen,
  onSelectPathway,
  onNewPathway,
  onRemovePathway,
  loading,
  children,
}: {
  store: GlassPathwaysStore;
  draftMode: boolean;
  layout: "strip" | "workspace";
  theme: "light" | "dark";
  savedListOpen: boolean;
  onSelectPathway: (id: string) => void;
  onNewPathway: () => void;
  onRemovePathway: (id: string) => void;
  loading: boolean;
  children: ReactNode;
}): JSX.Element {
  const showSavedSidebar = layout === "strip" && savedListOpen;
  const showSavedDrawer = layout === "workspace" && savedListOpen;

  return (
    <div
      className={`gpw-shell gpw-shell--${layout} gpw-shell--${theme}${showSavedSidebar ? " gpw-shell--saved-open" : ""}`}
      data-testid="glass-pathways-view"
    >
      {showSavedSidebar ? (
        <GlassPathwaysSavedList
          variant="sidebar"
          pathways={store.pathways}
          activePathwayId={store.activePathwayId}
          draftMode={draftMode}
          onSelect={onSelectPathway}
          onNew={onNewPathway}
          onRemove={onRemovePathway}
        />
      ) : null}
      <div className="gpw-main">
        {showSavedDrawer ? (
          <GlassPathwaysSavedList
            variant="drawer"
            pathways={store.pathways}
            activePathwayId={store.activePathwayId}
            draftMode={draftMode}
            onSelect={onSelectPathway}
            onNew={onNewPathway}
            onRemove={onRemovePathway}
          />
        ) : null}
        {loading ? (
          <div className="gpw-loading" data-testid="glass-pathways-loading" aria-live="polite">
            <span className="gpw-loading__pulse" aria-hidden="true" />
            <p className="gpw-loading__text">Mapping your pathway…</p>
            <p className="gpw-loading__hint">Glass is structuring stages from your goal.</p>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function GoalComposer({
  goal,
  onGoalChange,
  onGenerate,
  generateState,
  errorMessage,
  variant,
  hint,
  buttonLabel,
  testId,
  showIntro = true,
}: {
  goal: string;
  onGoalChange: (value: string) => void;
  onGenerate: () => void;
  generateState: GenerateState;
  errorMessage: string | null;
  variant: "empty" | "compact";
  hint?: string;
  buttonLabel: string;
  testId?: string;
  showIntro?: boolean;
}): JSX.Element {
  const isEmpty = variant === "empty";
  const disabled = generateState === "loading" || !goal.trim();

  const textarea = (
    <textarea
      className={`gpw-field__textarea${!isEmpty ? " gpw-field__textarea--compact" : ""}`}
      value={goal}
      onChange={(e) => onGoalChange(e.target.value)}
      onPointerDown={prepareGlassTextPointerDown}
      onFocus={() => armGlassSpacesOverlayPointer(true)}
      placeholder={
        isEmpty
          ? "e.g. Launch my macOS Electron app with onboarding, permissions, and a clean first-run experience"
          : "Describe a goal for a new pathway"
      }
      rows={isEmpty ? 4 : 2}
      disabled={generateState === "loading"}
      data-testid={testId ?? "glass-pathways-goal-input"}
    />
  );

  const generateButton = (
    <button
      type="button"
      className={`gpw-btn gpw-btn--primary${isEmpty ? " gpw-btn--full" : " gpw-btn--secondary"}`}
      onClick={onGenerate}
      disabled={disabled}
      data-testid="glass-pathways-generate"
    >
      {generateState === "loading" ? "Generating pathway…" : buttonLabel}
    </button>
  );

  return (
    <>
      {isEmpty && showIntro ? (
        <>
          <p className="gpw-empty__lead">
            Break a launch goal into clear stages — from discovery through ship.
          </p>
          <p className="gpw-empty__sub">Describe what you&apos;re building and Glass will map the path.</p>
        </>
      ) : null}

      {isEmpty ? (
        <label className="gpw-field">
          <span className="gpw-field__label">Your goal</span>
          {textarea}
        </label>
      ) : (
        <div className="gpw-composer__row">
          {textarea}
          {generateButton}
        </div>
      )}

      {hint ? <p className="gpw-composer__hint">{hint}</p> : null}

      {generateState === "error" && errorMessage ? (
        <div className="gpw-error-block" role="alert">
          <p className="gpw-error">{errorMessage}</p>
          <button
            type="button"
            className="gpw-btn gpw-btn--secondary gpw-error-block__retry"
            onClick={onGenerate}
            disabled={generateState === "loading"}
            data-testid="glass-pathways-retry"
          >
            Try again
          </button>
        </div>
      ) : null}

      {isEmpty ? generateButton : null}
    </>
  );
}

export interface GlassPathwaysViewProps {
  layout?: "strip" | "workspace";
  theme?: "light" | "dark";
  savedListOpen?: boolean;
  onToggleSavedList?: () => void;
}

export function GlassPathwaysView({
  layout = "strip",
  theme = "dark",
  savedListOpen = false,
}: GlassPathwaysViewProps): JSX.Element {
  const [store, setStore] = useState<GlassPathwaysStore>(() => loadPathwaysStore());
  const [goal, setGoal] = useState(() => getActivePathway(loadPathwaysStore())?.goal ?? "");
  const [generateState, setGenerateState] = useState<GenerateState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pathway = getActivePathway(store);
  const selectedStage = getSelectedStage(pathway, store.selectedStageId);
  const focusStage = pathway ? resolveFocusStage(pathway) : null;
  const draftMode = store.pathways.length > 0 && !store.activePathwayId;
  const loading = generateState === "loading";

  useEffect(() => {
    savePathwaysStore(store);
  }, [store]);

  const handleGenerate = useCallback(async (): Promise<void> => {
    const trimmed = goal.trim();
    if (!trimmed) {
      setErrorMessage("Describe your goal first.");
      setGenerateState("error");
      return;
    }

    setGenerateState("loading");
    setErrorMessage(null);

    try {
      const res = await window.glass.glassPathwaysGenerate({ goal: trimmed });
      if (res.error || !res.pathway) {
        setErrorMessage(formatPathwayGenerateError(res.error ?? "Generation failed"));
        setGenerateState("error");
        return;
      }
      setStore((prev) => addPathway(prev, res.pathway!));
      setGenerateState("idle");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Generation failed";
      setErrorMessage(formatPathwayGenerateError(raw));
      setGenerateState("error");
    }
  }, [goal]);

  const handleSelectPathway = useCallback((pathwayId: string): void => {
    const next = store.pathways.find((p) => p.id === pathwayId);
    setStore((prev) => switchActivePathway(prev, pathwayId));
    if (next) setGoal(next.goal);
    setGenerateState("idle");
    setErrorMessage(null);
  }, [store.pathways]);

  const handleNewPathway = useCallback((): void => {
    setStore((prev) => beginNewPathwayDraft(prev));
    setGoal("");
    setGenerateState("idle");
    setErrorMessage(null);
  }, []);

  const handleRemovePathway = useCallback((pathwayId: string): void => {
    setStore((prev) => {
      const next = removePathway(prev, pathwayId);
      const active = getActivePathway(next);
      if (active) setGoal(active.goal);
      else if (!next.pathways.length) setGoal("");
      return next;
    });
    setGenerateState("idle");
    setErrorMessage(null);
  }, []);

  const handleSelectStage = useCallback((stageId: string): void => {
    setStore((prev) => selectStage(prev, stageId));
  }, []);

  const handleBack = useCallback((): void => {
    setStore((prev) => selectStage(prev, null));
  }, []);

  const handleMarkActive = useCallback((): void => {
    if (!pathway || !selectedStage) return;
    setStore((prev) => markStageActive(prev, pathway.id, selectedStage.id));
  }, [pathway, selectedStage]);

  const handleMarkComplete = useCallback((): void => {
    if (!pathway || !selectedStage) return;
    setStore((prev) => markStageComplete(prev, pathway.id, selectedStage.id));
  }, [pathway, selectedStage]);

  const handleToggleSubstep = useCallback((substepIndex: number): void => {
    if (!pathway || !selectedStage) return;
    setStore((prev) => toggleStageSubstep(prev, pathway.id, selectedStage.id, substepIndex));
  }, [pathway, selectedStage]);

  const handleOpenStage = useCallback((stageId: string): void => {
    setStore((prev) => selectStage(prev, stageId));
  }, []);

  const handleBeginEscort = useCallback((target: PathwayEscortTarget): void => {
    if (!pathway || !selectedStage) return;
    setStore((prev) =>
      beginPathwayLiveSession(prev, {
        pathwayId: pathway.id,
        stageId: selectedStage.id,
        mode: "escort",
        targetLabel: target.label,
      }),
    );
  }, [pathway, selectedStage]);

  const handleBeginPrivacy = useCallback((reason: string): void => {
    if (!pathway || !selectedStage) return;
    const step = resolveFocusStep(pathway) ?? pathway.steps.find((s) => s.stageId === selectedStage.id);
    if (!step) return;
    setStore((prev) => {
      let next = enterPrivacyHandoff(
        prev,
        pathway.id,
        selectedStage.id,
        step.id,
        reason,
        step.description,
      );
      next = beginPathwayLiveSession(next, {
        pathwayId: pathway.id,
        stageId: selectedStage.id,
        stepId: step.id,
        mode: "privacy",
        privacyReason: reason,
      });
      return next;
    });
  }, [pathway, selectedStage]);

  const handleResumeFromPrivacy = useCallback((): void => {
    if (!pathway) return;
    setStore((prev) => {
      const handoffId = prev.pathways.find((p) => p.id === pathway.id)?.pendingHandoff?.id;
      let next = prev;
      if (handoffId) {
        next = resumePrivacyHandoff(next, pathway.id, handoffId, "manual_resume_button");
      }
      return endPathwayLiveSession(next);
    });
  }, [pathway]);

  const handleBeginExecution = useCallback((executionGoal: string): void => {
    if (!pathway || !selectedStage) return;
    setStore((prev) =>
      beginPathwayLiveSession(prev, {
        pathwayId: pathway.id,
        stageId: selectedStage.id,
        mode: "execution",
        executionGoal,
      }),
    );
  }, [pathway, selectedStage]);

  const handleEndExecution = useCallback((): void => {
    setStore((prev) => endPathwayLiveSession(prev));
  }, []);

  const handleBeginConnector = useCallback((match: PathwayConnectorMatch): void => {
    if (!pathway || !selectedStage) return;
    setStore((prev) =>
      beginPathwayLiveSession(prev, {
        pathwayId: pathway.id,
        stageId: selectedStage.id,
        mode: "connector",
        connectorId: match.connector.id,
        targetLabel: match.connector.label,
      }),
    );
  }, [pathway, selectedStage]);

  const handleBeginObserve = useCallback((): void => {
    if (!pathway || !selectedStage) return;
    setStore((prev) =>
      beginPathwayLiveSession(prev, {
        pathwayId: pathway.id,
        stageId: selectedStage.id,
        mode: "observe",
      }),
    );
  }, [pathway, selectedStage]);

  const handleCheckpoint = useCallback((): void => {
    if (!pathway || !selectedStage) return;
    setStore((prev) => addPathwayCheckpoint(prev, pathway.id, selectedStage.id));
  }, [pathway, selectedStage]);

  const handlePathwayCheckpoint = useCallback((): void => {
    if (!pathway) return;
    const focusId = pathway.currentStageId
      ?? pathway.stages.find((s) => s.status === "active")?.id
      ?? pathway.stages.find((s) => s.status === "pending")?.id;
    if (!focusId) return;
    setStore((prev) => addPathwayCheckpoint(prev, pathway.id, focusId));
  }, [pathway]);

  const generateHint =
    store.pathways.length > 0
      ? "Creates a new saved pathway — your existing ones stay in the list."
      : undefined;

  if (selectedStage && pathway) {
    return (
      <PathwaysShell
        store={store}
        draftMode={draftMode}
        layout={layout}
        theme={theme}
        savedListOpen={savedListOpen}
        onSelectPathway={handleSelectPathway}
        onNewPathway={handleNewPathway}
        onRemovePathway={handleRemovePathway}
        loading={loading}
      >
        <GlassPathwayStageDetail
          pathway={pathway}
          stage={selectedStage}
          liveSession={store.liveSession}
          onMarkActive={handleMarkActive}
          onMarkComplete={handleMarkComplete}
          onToggleSubstep={handleToggleSubstep}
          onBeginEscort={handleBeginEscort}
          onBeginPrivacy={handleBeginPrivacy}
          onResumeFromPrivacy={handleResumeFromPrivacy}
          onBeginConnector={handleBeginConnector}
          onBeginObserve={handleBeginObserve}
          onBeginExecution={handleBeginExecution}
          onEndExecution={handleEndExecution}
          onCheckpoint={handleCheckpoint}
          onBack={handleBack}
        />
      </PathwaysShell>
    );
  }

  if (!pathway) {
    return (
      <PathwaysShell
        store={store}
        draftMode={draftMode}
        layout={layout}
        theme={theme}
        savedListOpen={savedListOpen}
        onSelectPathway={handleSelectPathway}
        onNewPathway={handleNewPathway}
        onRemovePathway={handleRemovePathway}
        loading={loading}
      >
        <div className="gpw-empty" data-testid="glass-pathways-empty">
          <GoalComposer
            goal={goal}
            onGoalChange={setGoal}
            onGenerate={() => void handleGenerate()}
            generateState={generateState}
            errorMessage={errorMessage}
            variant={store.pathways.length === 0 ? "empty" : "compact"}
            hint={draftMode ? generateHint : undefined}
            buttonLabel="Generate pathway"
            testId="glass-pathways-goal-input"
            showIntro={layout !== "workspace"}
          />
        </div>
      </PathwaysShell>
    );
  }

  return (
    <PathwaysShell
      store={store}
      draftMode={draftMode}
      layout={layout}
      theme={theme}
      savedListOpen={savedListOpen}
      onSelectPathway={handleSelectPathway}
      onNewPathway={handleNewPathway}
      onRemovePathway={handleRemovePathway}
      loading={loading}
    >
      <div className="gpw-pathway">
        <GlassPathwayHeader pathway={pathway} liveSession={store.liveSession} />

        <GlassPathwayRuntimePanel
          pathway={pathway}
          liveSession={store.liveSession}
          onCheckpoint={handlePathwayCheckpoint}
        />

        <GlassPathwayGuidanceCard pathway={pathway} onOpenStage={handleOpenStage} />

        <div className="gpw-pathway__composer">
          <GoalComposer
            goal={goal}
            onGoalChange={setGoal}
            onGenerate={() => void handleGenerate()}
            generateState={generateState}
            errorMessage={errorMessage}
            variant="compact"
            hint={generateHint}
            buttonLabel="Generate new pathway"
          />
        </div>

        <GlassPathwayStageList
          stages={pathway.stages}
          selectedStageId={store.selectedStageId}
          focusStageId={focusStage?.id ?? null}
          onSelectStage={handleSelectStage}
        />
      </div>
    </PathwaysShell>
  );
}
