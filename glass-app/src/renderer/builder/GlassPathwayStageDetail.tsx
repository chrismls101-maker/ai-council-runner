import { useCallback, useEffect, useMemo, useState } from "react";
import type { GlassPathway, GlassPathwayStage, PathwayLiveSession } from "../../shared/glassPathwaysTypes.ts";
import { stageCompletionStrings, stageUserActions } from "../../shared/glassPathwaysTypes.ts";
import { resolvePathwayActionRoute } from "../../shared/glassPathwaysActionRouting.ts";
import type { PathwayEscortTarget } from "../../shared/glassPathwaysEscort.ts";
import type { PathwayConnectorMatch } from "../../shared/glassPathwaysConnectors.ts";
import {
  buildAletheiaHelpPrompt,
  buildStageExplainPrompt,
  buildStageStuckPrompt,
  pathwaySubsteps,
  substepDoneAt,
  substepProgressLabel,
} from "../../shared/glassPathwaysGuidance.ts";
import { formatPathwayGenerateError } from "../../shared/glassPathwaysProgress.ts";
import { prepareGlassTextPointerDown } from "../glassTextInteraction.ts";
import { send } from "../useGlassState.ts";
import { GlassPathwayEscortPanel } from "./GlassPathwayEscortPanel.tsx";
import { GlassPathwayActionRoutingPanel } from "./GlassPathwayActionRoutingPanel.tsx";
import { GlassPathwayExecutionPanel } from "./GlassPathwayExecutionPanel.tsx";
import { GlassPathwayRuntimePanel } from "./GlassPathwayRuntimePanel.tsx";

type GuidanceState = "idle" | "loading" | "error";

interface GlassPathwayStageDetailProps {
  pathway: GlassPathway;
  stage: GlassPathwayStage;
  liveSession: PathwayLiveSession | null;
  onMarkActive: () => void;
  onMarkComplete: () => void;
  onToggleSubstep: (index: number) => void;
  onBeginEscort: (target: PathwayEscortTarget) => void;
  onBeginPrivacy: (reason: string) => void;
  onResumeFromPrivacy: () => void;
  onBeginConnector: (match: PathwayConnectorMatch) => void;
  onBeginObserve: () => void;
  onBeginExecution: (goal: string) => void;
  onEndExecution: () => void;
  onCheckpoint: () => void;
  onBack: () => void;
}

function DetailSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section className="gpw-detail__section">
      <h3 className="gpw-detail__heading">{title}</h3>
      <ul className="gpw-detail__list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function GlassPathwayStageDetail({
  pathway,
  stage,
  liveSession,
  onMarkActive,
  onMarkComplete,
  onToggleSubstep,
  onBeginEscort,
  onBeginPrivacy,
  onResumeFromPrivacy,
  onBeginConnector,
  onBeginObserve,
  onBeginExecution,
  onEndExecution,
  onCheckpoint,
  onBack,
}: GlassPathwayStageDetailProps): JSX.Element {
  const substeps = pathwaySubsteps(stage, pathway);
  const substepLabel = substepProgressLabel(stage, pathway);
  const stageSteps = pathway.steps
    .filter((s) => s.stageId === stage.id)
    .sort((a, b) => a.index - b.index);
  const [guidanceState, setGuidanceState] = useState<GuidanceState>("idle");
  const [guidanceText, setGuidanceText] = useState<string | null>(null);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);
  const routePlan = useMemo(
    () => resolvePathwayActionRoute(pathway, stage),
    [pathway, stage],
  );

  useEffect(() => {
    setGuidanceText(null);
    setGuidanceError(null);
    setGuidanceState("idle");
  }, [stage.id, pathway.id]);

  const prefillAsk = useCallback((text: string): void => {
    send({ type: "prefill-command-bar", text });
  }, []);

  const fetchInlineGuidance = useCallback(
    async (mode: "explain" | "stuck"): Promise<void> => {
      setGuidanceState("loading");
      setGuidanceError(null);
      try {
        const res = await window.glass.glassPathwaysStageGuidance({
          pathway,
          stageId: stage.id,
          mode,
        });
        if (res.error || !res.answer) {
          setGuidanceError(formatPathwayGenerateError(res.error ?? "Guidance failed"));
          setGuidanceState("error");
          return;
        }
        setGuidanceText(res.answer);
        setGuidanceState("idle");
      } catch (err) {
        setGuidanceError(formatPathwayGenerateError(
          err instanceof Error ? err.message : "Guidance failed",
        ));
        setGuidanceState("error");
      }
    },
    [pathway, stage.id],
  );

  return (
    <div className="gpw-detail" data-testid="glass-pathway-stage-detail">
      <button type="button" className="gpw-detail__back" onClick={onBack}>
        ← Back to pathway
      </button>

      <div className="gpw-detail__header">
        <span className="gpw-detail__num">Stage {stage.index}</span>
        <h2 className="gpw-detail__title">{stage.title}</h2>
        <p className="gpw-detail__objective">{stage.objective}</p>
      </div>

      <GlassPathwayRuntimePanel
        pathway={pathway}
        liveSession={liveSession}
        onCheckpoint={onCheckpoint}
        compact
      />

      <GlassPathwayEscortPanel
        pathway={pathway}
        stage={stage}
        liveSession={liveSession}
        onBeginEscort={onBeginEscort}
        onBeginPrivacy={onBeginPrivacy}
        onResumeFromPrivacy={onResumeFromPrivacy}
      />

      <GlassPathwayActionRoutingPanel
        pathway={pathway}
        stage={stage}
        liveSession={liveSession}
        onBeginConnector={onBeginConnector}
        onBeginObserve={onBeginObserve}
      />

      <GlassPathwayExecutionPanel
        pathway={pathway}
        stage={stage}
        liveSession={liveSession}
        primaryRoute={routePlan.primary}
        onBeginExecution={onBeginExecution}
        onEndExecution={onEndExecution}
        onResumeFromPrivacy={onResumeFromPrivacy}
      />

      <div className="gpw-detail__guidance-actions">
        <button
          type="button"
          className="gpw-btn gpw-btn--secondary"
          onClick={() => void fetchInlineGuidance("explain")}
          disabled={guidanceState === "loading"}
          data-testid="glass-pathways-explain-stage"
        >
          {guidanceState === "loading" ? "Thinking…" : "Explain this stage"}
        </button>
        <button
          type="button"
          className="gpw-btn gpw-btn--secondary"
          onClick={() => void fetchInlineGuidance("stuck")}
          disabled={guidanceState === "loading"}
          data-testid="glass-pathways-stuck-stage"
        >
          I&apos;m stuck
        </button>
        <button
          type="button"
          className="gpw-btn gpw-btn--secondary gpw-detail__ask-link"
          onClick={() => prefillAsk(buildStageExplainPrompt(pathway, stage))}
          onPointerDown={prepareGlassTextPointerDown}
        >
          Ask in command bar ↗
        </button>
      </div>

      {guidanceError ? (
        <p className="gpw-error" role="alert">{guidanceError}</p>
      ) : null}

      {guidanceText ? (
        <section className="gpw-detail__inline-guidance" data-testid="glass-pathways-inline-guidance">
          <h3 className="gpw-detail__heading">Aletheia&apos;s guidance</h3>
          <p className="gpw-detail__text">{guidanceText}</p>
        </section>
      ) : null}

      <div className="gpw-detail__body">
        <section className="gpw-detail__section">
          <h3 className="gpw-detail__heading">Why it matters</h3>
          <p className="gpw-detail__text">{stage.whyItMatters}</p>
        </section>

        {substeps.length > 0 ? (
          <section className="gpw-detail__section">
            <h3 className="gpw-detail__heading">
              Steps
              {substepLabel ? (
                <span className="gpw-detail__substep-count">{substepLabel}</span>
              ) : null}
            </h3>
            <ul className="gpw-substep-list">
              {substeps.map((label, index) => {
                const stepMeta = stageSteps[index];
                return (
                <li key={stepMeta?.id ?? `${stage.id}-sub-${index}`}>
                  <label className="gpw-substep">
                    <input
                      type="checkbox"
                      checked={substepDoneAt(stage, index, pathway)}
                      onChange={() => onToggleSubstep(index)}
                    />
                    <span>
                      {stepMeta ? (
                        <span className="gpw-substep__mode">{stepMeta.mode}</span>
                      ) : null}
                      {label}
                    </span>
                  </label>
                </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <DetailSection title="What to review" items={stage.whatToReview ?? []} />
        <DetailSection title="Common mistakes to avoid" items={stage.commonMistakes} />

        {(stage.alethiaHelp?.length ?? 0) > 0 ? (
          <section className="gpw-detail__section">
            <h3 className="gpw-detail__heading">What Aletheia can help with here</h3>
            <ul className="gpw-detail__list">
              {stage.alethiaHelp!.map((item) => (
                <li key={item}>
                  <span>{item}</span>
                  <button
                    type="button"
                    className="gpw-detail__help-ask"
                    onClick={() => prefillAsk(buildAletheiaHelpPrompt(pathway, stage, item))}
                    onPointerDown={prepareGlassTextPointerDown}
                  >
                    Ask ↗
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <DetailSection title="Your next moves" items={stageUserActions(stage)} />
        <DetailSection title="You'll know you're done when" items={stageCompletionStrings(stage)} />
      </div>

      <div className="gpw-detail__actions">
        <button
          type="button"
          className="gpw-btn gpw-btn--secondary"
          onClick={() => prefillAsk(buildStageStuckPrompt(pathway, stage))}
          onPointerDown={prepareGlassTextPointerDown}
        >
          Think it through ↗
        </button>
        <button
          type="button"
          className="gpw-btn gpw-btn--secondary"
          onClick={onMarkActive}
          disabled={stage.status === "active"}
        >
          Mark active
        </button>
        <button
          type="button"
          className="gpw-btn gpw-btn--primary"
          onClick={onMarkComplete}
          disabled={stage.status === "completed"}
        >
          Mark complete
        </button>
      </div>
    </div>
  );
}
