import { useCallback, useMemo } from "react";
import type { GlassPathway, GlassPathwayStage, PathwayLiveSession } from "../../shared/glassPathwaysTypes.ts";
import {
  buildPathwayConnectorPrompt,
  buildPathwayObservePrompt,
  pathwayRouteKindLabel,
  resolvePathwayActionRoute,
} from "../../shared/glassPathwaysActionRouting.ts";
import type { PathwayConnectorMatch } from "../../shared/glassPathwaysConnectors.ts";
import { prepareGlassTextPointerDown } from "../glassTextInteraction.ts";
import { send } from "../useGlassState.ts";

interface GlassPathwayActionRoutingPanelProps {
  pathway: GlassPathway;
  stage: GlassPathwayStage;
  liveSession: PathwayLiveSession | null;
  onBeginConnector: (match: PathwayConnectorMatch) => void;
  onBeginObserve: () => void;
}

function openAgentWorkspace(agentId: string, prompt: string): void {
  if (agentId === "research") {
    window.glass.openResearchExplorer(prompt);
    return;
  }
  if (agentId === "code") {
    window.glass.openCodeAnalystExplorer(prompt);
    return;
  }
  if (agentId === "writing") {
    window.glass.openWritingStudio(prompt);
    return;
  }
  if (agentId === "coder") {
    send({ type: "open-coder-with-prompt", prompt });
  }
}

export function GlassPathwayActionRoutingPanel({
  pathway,
  stage,
  liveSession,
  onBeginConnector,
  onBeginObserve,
}: GlassPathwayActionRoutingPanelProps): JSX.Element | null {
  const routePlan = useMemo(
    () => resolvePathwayActionRoute(pathway, stage),
    [pathway, stage],
  );

  const sessionForStage =
    liveSession?.pathwayId === pathway.id && liveSession.stageId === stage.id
      ? liveSession
      : null;

  const handleConnector = useCallback((): void => {
    const match = routePlan.connector;
    if (!match) return;

    if (match.connector.status === "needs_connection") {
      send({ type: "open-glass-setup" });
      onBeginConnector(match);
      return;
    }

    const prompt = buildPathwayConnectorPrompt(pathway, stage, match);
    if (match.connector.agentId) {
      openAgentWorkspace(match.connector.agentId, prompt);
    } else {
      send({ type: "prefill-command-bar", text: prompt });
    }
    onBeginConnector(match);
  }, [onBeginConnector, pathway, routePlan.connector, stage]);

  const handleObserve = useCallback((): void => {
    onBeginObserve();
    send({
      type: "prefill-command-bar",
      text: buildPathwayObservePrompt(pathway, stage),
    });
  }, [onBeginObserve, pathway, stage]);

  if (routePlan.primary === "manual") {
    return null;
  }

  const connectorActive =
    sessionForStage?.mode === "connector" && routePlan.connector;
  const observeActive = sessionForStage?.mode === "observe";

  const primaryLabel = pathwayRouteKindLabel(routePlan.primary);

  return (
    <section className="gpw-routing" data-testid="glass-pathway-action-routing">
      <h3 className="gpw-routing__heading">Recommended action path</h3>
      <p className="gpw-routing__reason">{routePlan.reason}</p>

      <ol className="gpw-routing__hierarchy">
        {routePlan.hierarchy.map((step) => (
          <li
            key={step.kind}
            className={`gpw-routing__step${step.active ? " gpw-routing__step--active" : ""}`}
            data-testid={`glass-pathways-route-${step.kind}`}
          >
            <span className="gpw-routing__step-label">{step.label}</span>
            {step.detail ? (
              <span className="gpw-routing__step-detail">{step.detail}</span>
            ) : null}
          </li>
        ))}
      </ol>

      {connectorActive ? (
        <div className="gpw-routing__banner" role="status">
          <strong>{primaryLabel} in progress</strong>
          <p>
            Using {routePlan.connector!.connector.label}
            {routePlan.connector!.connector.status === "needs_connection"
              ? " — finish connecting in Setup, then continue."
              : " — check the workspace or command bar for progress."}
          </p>
        </div>
      ) : observeActive ? (
        <div className="gpw-routing__banner gpw-routing__banner--observe" role="status">
          <strong>Observational guidance</strong>
          <p>Ask Aletheia in the command bar — read-only guidance for this stage.</p>
        </div>
      ) : null}

      <div className="gpw-routing__actions">
        {routePlan.primary === "connector" && routePlan.connector ? (
          <button
            type="button"
            className="gpw-btn gpw-btn--primary"
            onClick={handleConnector}
            onPointerDown={prepareGlassTextPointerDown}
            data-testid="glass-pathways-use-connector"
          >
            {routePlan.connector.connector.status === "needs_connection"
              ? `Connect ${routePlan.connector.connector.label}`
              : `Use ${routePlan.connector.connector.label}`}
          </button>
        ) : null}

        {routePlan.primary === "observe" || routePlan.observeEligible ? (
          <button
            type="button"
            className={`gpw-btn${routePlan.primary === "observe" ? " gpw-btn--primary" : " gpw-btn--secondary"}`}
            onClick={handleObserve}
            onPointerDown={prepareGlassTextPointerDown}
            data-testid="glass-pathways-observe-stage"
          >
            Observe &amp; guide
          </button>
        ) : null}
      </div>

      {routePlan.operatorFallback && routePlan.primary !== "operator" ? (
        <p className="gpw-routing__fallback-note">
          Computer operator is available below only if connector or observational guidance is not enough.
        </p>
      ) : null}
    </section>
  );
}
