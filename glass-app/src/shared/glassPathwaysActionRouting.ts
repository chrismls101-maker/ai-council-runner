/**
 * Glass Pathways — action routing hierarchy (Phase 7).
 * 1. Connector / direct API  2. Observe  3. Computer operator (fallback)
 */

import type { Pathway, Stage } from "./glassPathwaysTypes.ts";
import { stageUserActions } from "./glassPathwaysTypes.ts";
import { detectStagePrivacyHandoff } from "./glassPathwaysEscort.ts";
import { recommendedNextMove } from "./glassPathwaysGuidance.ts";
import {
  inferPathwayConnectorsForStage,
  type PathwayConnectorMatch,
} from "./glassPathwaysConnectors.ts";

export type PathwayActionRouteKind = "manual" | "connector" | "observe" | "operator";

export interface PathwayActionRouteStep {
  kind: PathwayActionRouteKind;
  label: string;
  active: boolean;
  detail?: string;
}

export interface PathwayActionRoutePlan {
  primary: PathwayActionRouteKind;
  connector?: PathwayConnectorMatch;
  reason: string;
  hierarchy: PathwayActionRouteStep[];
  observeEligible: boolean;
  operatorFallback: boolean;
}

const OBSERVE_PATTERNS =
  /\b(review|read|check|understand|audit|assess|compare|inspect|look for|what to look|summarize what|explain what|verify|evaluate)\b/i;

const OPERATOR_PATTERNS =
  /\b(click|type|fill in|submit|navigate|open app|install|configure|drag|select menu|press button)\b/i;

function stageCorpus(stage: Stage, pathway: Pathway): string {
  return [
    pathway.goal,
    pathway.title,
    pathway.domain,
    stage.title,
    stage.objective,
    stage.whyItMatters,
    ...(stage.whatToReview ?? []),
    ...(stage.alethiaHelp ?? []),
    ...stageUserActions(stage),
    ...stage.completionCriteria.map((c) => c.description),
  ].join("\n");
}

function isObserveLike(stage: Stage, pathway: Pathway): boolean {
  const corpus = stageCorpus(stage, pathway);
  const move = recommendedNextMove(stage, pathway);
  const text = `${corpus}\n${move}`;
  if (OPERATOR_PATTERNS.test(text)) return false;
  if (stage.whatToReview && stage.whatToReview.length > 0 && !OPERATOR_PATTERNS.test(move)) return true;
  return OBSERVE_PATTERNS.test(text);
}

function buildHierarchy(
  primary: PathwayActionRouteKind,
  connector?: PathwayConnectorMatch,
): PathwayActionRouteStep[] {
  const connectorDetail = connector
    ? `${connector.connector.label}${connector.connector.status === "needs_connection" ? " (connect first)" : ""}`
    : "Direct service access";

  return [
    {
      kind: "connector",
      label: "Connector / API",
      active: primary === "connector",
      detail: connectorDetail,
    },
    {
      kind: "observe",
      label: "Observe & guide",
      active: primary === "observe",
      detail: "Read-only screen guidance",
    },
    {
      kind: "operator",
      label: "Computer operator",
      active: primary === "operator",
      detail: "Visual automation — fallback only",
    },
  ];
}

export function resolvePathwayActionRoute(
  pathway: Pathway,
  stage: Stage,
): PathwayActionRoutePlan {
  const privacy = detectStagePrivacyHandoff(stage, pathway);
  if (privacy.needed) {
    return {
      primary: "manual",
      reason: privacy.reason,
      hierarchy: buildHierarchy("manual"),
      observeEligible: false,
      operatorFallback: false,
    };
  }

  const connectors = inferPathwayConnectorsForStage(stage, pathway);
  const topConnector = connectors[0];

  if (topConnector) {
    const reason =
      topConnector.connector.status === "available"
        ? `${topConnector.connector.label} can handle this stage without screen automation.`
        : `${topConnector.connector.label} has a direct connector — connect it before using visual automation.`;
    return {
      primary: "connector",
      connector: topConnector,
      reason,
      hierarchy: buildHierarchy("connector", topConnector),
      observeEligible: isObserveLike(stage, pathway),
      operatorFallback: true,
    };
  }

  if (isObserveLike(stage, pathway)) {
    return {
      primary: "observe",
      reason: "This stage looks read-only — Aletheia can observe and guide before any clicking.",
      hierarchy: buildHierarchy("observe"),
      observeEligible: true,
      operatorFallback: true,
    };
  }

  return {
    primary: "operator",
    reason: "This stage likely needs navigation or input — computer operator is the fallback path.",
    hierarchy: buildHierarchy("operator"),
    observeEligible: false,
    operatorFallback: true,
  };
}

export function buildPathwayObservePrompt(
  pathway: Pathway,
  stage: Stage,
): string {
  return [
    "Glass Pathway — observational guidance only (delegated presence).",
    "Read what's on screen and guide me — do not click or type unless I explicitly ask.",
    "",
    `Pathway: ${pathway.title}`,
    `Goal: ${pathway.goal}`,
    `Stage ${stage.index}: ${stage.title}`,
    `Objective: ${stage.objective}`,
    `Focus: ${recommendedNextMove(stage, pathway)}`,
  ].join("\n");
}

export function buildPathwayConnectorPrompt(
  pathway: Pathway,
  stage: Stage,
  match: PathwayConnectorMatch,
): string {
  const via = match.connector.agentId
    ? `via ${match.connector.label}`
    : `via ${match.connector.service} connector`;
  return [
    `Glass Pathway — use direct service access ${via}, not screen automation.`,
    "",
    `Pathway: ${pathway.title}`,
    `Goal: ${pathway.goal}`,
    `Stage ${stage.index}: ${stage.title}`,
    `Objective: ${stage.objective}`,
    `Do: ${recommendedNextMove(stage, pathway)}`,
    match.connector.readOnlyDefault
      ? "Prefer read-only actions unless I explicitly approve writes."
      : "Flag any write or destructive action before executing.",
  ].join("\n");
}

export function pathwayRouteKindLabel(kind: PathwayActionRouteKind): string {
  switch (kind) {
    case "connector":
      return "Connector";
    case "observe":
      return "Observe";
    case "operator":
      return "Computer operator";
    case "manual":
      return "Manual";
  }
}

export function pathwayExecutionShowsAsFallback(
  primaryRoute: PathwayActionRouteKind,
): boolean {
  return primaryRoute === "connector" || primaryRoute === "observe";
}
