import { useCallback, useEffect, useState } from "react";
import type { GlassPathway, GlassPathwayStage, PathwayLiveSession } from "../../shared/glassPathwaysTypes.ts";
import type { PathwayActionRouteKind } from "../../shared/glassPathwaysActionRouting.ts";
import { pathwayExecutionShowsAsFallback } from "../../shared/glassPathwaysActionRouting.ts";
import {
  assessPathwayExecutionEligibility,
  buildPathwayExecutionGoal,
  pathwayExecutionScopeLines,
} from "../../shared/glassPathwaysExecution.ts";
import { prepareGlassTextPointerDown } from "../glassTextInteraction.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { AletheiaComputerSessionPanel } from "./AletheiaComputerSessionPanel.tsx";

interface GlassPathwayExecutionPanelProps {
  pathway: GlassPathway;
  stage: GlassPathwayStage;
  liveSession: PathwayLiveSession | null;
  primaryRoute: PathwayActionRouteKind;
  onBeginExecution: (goal: string) => void;
  onEndExecution: () => void;
  onResumeFromPrivacy: () => void;
}

export function GlassPathwayExecutionPanel({
  pathway,
  stage,
  liveSession,
  primaryRoute,
  onBeginExecution,
  onEndExecution,
  onResumeFromPrivacy,
}: GlassPathwayExecutionPanelProps): JSX.Element | null {
  const glassState = useGlassState();
  const operator = glassState.aletheiaComputerOperator;
  const companionPrivacyActive = glassState.companionPrivacy?.active === true;
  const [fallbackExpanded, setFallbackExpanded] = useState(false);

  useEffect(() => {
    setFallbackExpanded(false);
  }, [stage.id, pathway.id]);

  const sessionForStage =
    liveSession?.pathwayId === pathway.id && liveSession.stageId === stage.id
      ? liveSession
      : null;

  const showAsFallback = pathwayExecutionShowsAsFallback(primaryRoute);

  const eligibility = assessPathwayExecutionEligibility(pathway, stage, {
    companionPrivacyActive,
    liveSessionMode: sessionForStage?.mode,
    primaryRoute,
    explicitFallback: showAsFallback && fallbackExpanded,
  });

  useEffect(() => {
    if (sessionForStage?.mode !== "execution" || !operator) return;
    if (operator.phase === "complete" || operator.phase === "failed") {
      onEndExecution();
    }
  }, [sessionForStage?.mode, operator?.phase, operator, onEndExecution]);

  useEffect(() => {
    if (sessionForStage?.mode === "privacy" && !companionPrivacyActive) {
      onResumeFromPrivacy();
    }
  }, [sessionForStage?.mode, companionPrivacyActive, onResumeFromPrivacy]);

  const handleContinueForMe = useCallback((): void => {
    const goal = buildPathwayExecutionGoal(pathway, stage);
    onBeginExecution(goal);
    send({ type: "prepare-aletheia-computer-operator", goal });
  }, [onBeginExecution, pathway, stage]);

  const handleCancelOperator = useCallback((): void => {
    send({ type: "cancel-aletheia-computer-operator" });
    onEndExecution();
  }, [onEndExecution]);

  const executionActive =
    sessionForStage?.mode === "execution"
    && operator
    && (operator.phase === "awaiting_grant"
      || operator.phase === "awaiting_confirm"
      || operator.phase === "running");

  if (primaryRoute === "manual" && !executionActive) {
    return null;
  }

  if (!eligibility.allowed && !executionActive) {
    if (showAsFallback && !fallbackExpanded) {
      return (
        <section className="gpw-execution gpw-execution--fallback" data-testid="glass-pathway-execution-fallback">
          <button
            type="button"
            className="gpw-execution__fallback-toggle"
            onClick={() => setFallbackExpanded(true)}
            data-testid="glass-pathways-execution-fallback-toggle"
          >
            Use computer operator instead (fallback)
          </button>
        </section>
      );
    }
    return eligibility.reason ? (
      <p className="gpw-execution__blocked" data-testid="glass-pathways-execution-blocked">
        {eligibility.reason}
      </p>
    ) : null;
  }

  return (
    <section
      className={`gpw-execution${showAsFallback ? " gpw-execution--fallback-expanded" : ""}`}
      data-testid="glass-pathway-execution-panel"
    >
      {executionActive && operator ? (
        <>
          <div className="gpw-execution__banner" role="status">
            <strong>Controlled execution</strong>
            <p>Aletheia will act only within this stage — grant the session to continue.</p>
          </div>
          <AletheiaComputerSessionPanel
            operator={operator}
            variant="inline"
            lastPrompt={sessionForStage?.executionGoal}
            onDismiss={handleCancelOperator}
          />
          {operator.phase === "running" ? (
            <button
              type="button"
              className="gpw-btn gpw-btn--secondary"
              onClick={handleCancelOperator}
              data-testid="glass-pathways-execution-stop"
            >
              Stop execution
            </button>
          ) : null}
        </>
      ) : (
        <>
          <h3 className="gpw-execution__heading">
            {showAsFallback ? "Computer operator (fallback)" : "Continue for me"}
          </h3>
          <p className="gpw-execution__hint">
            {showAsFallback
              ? "Visual automation only if connector or observational guidance is not enough."
              : "Starts a bounded computer-operator session for this stage — you approve before anything runs."}
          </p>
          <ul className="gpw-execution__scope">
            {pathwayExecutionScopeLines().map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <button
            type="button"
            className={`gpw-btn${showAsFallback ? " gpw-btn--secondary" : " gpw-btn--primary"}`}
            onClick={handleContinueForMe}
            onPointerDown={prepareGlassTextPointerDown}
            disabled={!eligibility.allowed}
            data-testid="glass-pathways-continue-for-me"
          >
            Continue for me
          </button>
        </>
      )}
    </section>
  );
}
