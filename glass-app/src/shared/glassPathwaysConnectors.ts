/**
 * Glass Pathways — connector catalog (Phase 7).
 * Declarative registry; real MCP/oauth wiring lands incrementally per connector.
 */

import type { GlassAgentId } from "./ipc.ts";
import type { Pathway, Stage } from "./glassPathwaysTypes.ts";
import { stageUserActions } from "./glassPathwaysTypes.ts";

export type PathwayConnectorStatus = "available" | "needs_connection";

export type PathwayConnectorKind = "mcp" | "agent_bridge";

export interface PathwayConnectorDefinition {
  id: string;
  label: string;
  service: string;
  status: PathwayConnectorStatus;
  kind: PathwayConnectorKind;
  match: RegExp;
  /** When routed through an existing Glass agent instead of a live MCP socket. */
  agentId?: GlassAgentId;
  readOnlyDefault: boolean;
  setupHint?: string;
}

export interface PathwayConnectorMatch {
  connector: PathwayConnectorDefinition;
  confidence: "high" | "medium";
}

export const PATHWAY_CONNECTOR_CATALOG: readonly PathwayConnectorDefinition[] = [
  {
    id: "gmail",
    label: "Gmail",
    service: "Google Mail",
    status: "needs_connection",
    kind: "mcp",
    match: /\b(gmail|email inbox|send email|draft email|unread mail)\b/i,
    readOnlyDefault: false,
    setupHint: "Connect Gmail in Glass Setup when available — API access avoids screen automation.",
  },
  {
    id: "google-calendar",
    label: "Google Calendar",
    service: "Google Calendar",
    status: "needs_connection",
    kind: "mcp",
    match: /\b(google calendar|calendar event|schedule meeting|book a slot)\b/i,
    readOnlyDefault: false,
    setupHint: "Connect Google Calendar in Glass Setup when available.",
  },
  {
    id: "slack",
    label: "Slack",
    service: "Slack",
    status: "needs_connection",
    kind: "mcp",
    match: /\b(slack|unread thread|slack channel|dm on slack)\b/i,
    readOnlyDefault: true,
    setupHint: "Connect Slack in Glass Setup when available — prefer API over clicking through Slack.",
  },
  {
    id: "notion",
    label: "Notion",
    service: "Notion",
    status: "needs_connection",
    kind: "mcp",
    match: /\b(notion|notion page|notion database)\b/i,
    readOnlyDefault: false,
    setupHint: "Connect Notion in Glass Setup when available.",
  },
  {
    id: "google-drive",
    label: "Google Drive",
    service: "Google Drive",
    status: "needs_connection",
    kind: "mcp",
    match: /\b(google drive|drive folder|shared doc)\b/i,
    readOnlyDefault: true,
    setupHint: "Connect Google Drive in Glass Setup when available.",
  },
  {
    id: "linear",
    label: "Linear",
    service: "Linear",
    status: "needs_connection",
    kind: "mcp",
    match: /\b(linear\.app|linear issue|linear ticket)\b/i,
    readOnlyDefault: false,
    setupHint: "Connect Linear in Glass Setup when available.",
  },
  {
    id: "github",
    label: "GitHub",
    service: "GitHub",
    status: "available",
    kind: "agent_bridge",
    agentId: "research",
    match: /\b(github|pull request|repository|issue tracker|commit history)\b/i,
    readOnlyDefault: true,
    setupHint: "Uses Research Agent for public GitHub context until a direct connector is linked.",
  },
  {
    id: "research",
    label: "Research",
    service: "Web research",
    status: "available",
    kind: "agent_bridge",
    agentId: "research",
    match: /\b(research|competitor|market|survey|compare options|find sources)\b/i,
    readOnlyDefault: true,
  },
  {
    id: "code-analyst",
    label: "Code Analyst",
    service: "Codebase",
    status: "available",
    kind: "agent_bridge",
    agentId: "code",
    match: /\b(codebase|refactor|module review|analyze (the )?code|code review)\b/i,
    readOnlyDefault: true,
  },
  {
    id: "writing",
    label: "Writing",
    service: "Documents",
    status: "available",
    kind: "agent_bridge",
    agentId: "writing",
    match: /\b(write a draft|outline|blog post|launch email|essay|copy for)\b/i,
    readOnlyDefault: false,
  },
  {
    id: "coder",
    label: "Glass Coder",
    service: "Implementation",
    status: "available",
    kind: "agent_bridge",
    agentId: "coder",
    match: /\b(implement|add feature|fix bug|typescript|electron app|build the)\b/i,
    readOnlyDefault: false,
  },
] as const;

function connectorConfidence(corpus: string, connector: PathwayConnectorDefinition): "high" | "medium" | null {
  if (!connector.match.test(corpus)) return null;
  const labelHit = new RegExp(`\\b${connector.label.replace(/\s+/g, "\\s+")}\\b`, "i").test(corpus);
  return labelHit ? "high" : "medium";
}

export function inferPathwayConnectors(corpus: string): PathwayConnectorMatch[] {
  const matches: PathwayConnectorMatch[] = [];
  const seen = new Set<string>();

  for (const connector of PATHWAY_CONNECTOR_CATALOG) {
    const confidence = connectorConfidence(corpus, connector);
    if (!confidence || seen.has(connector.id)) continue;
    seen.add(connector.id);
    matches.push({ connector, confidence });
  }

  return sortConnectorMatches(matches).slice(0, 3);
}

function sortConnectorMatches(matches: PathwayConnectorMatch[]): PathwayConnectorMatch[] {
  return matches.sort((a, b) => {
    const statusScore = (s: PathwayConnectorStatus) => (s === "available" ? 0 : 1);
    const rank = statusScore(a.connector.status) - statusScore(b.connector.status);
    if (rank !== 0) return rank;
    const confRank = a.confidence === "high" ? 0 : 1;
    const confRankB = b.confidence === "high" ? 0 : 1;
    return confRank - confRankB;
  });
}

export function inferPathwayConnectorsForStage(
  stage: Stage,
  pathway: Pathway,
): PathwayConnectorMatch[] {
  const stageCorpus = [
    stage.title,
    stage.objective,
    stage.whyItMatters,
    ...(stage.whatToReview ?? []),
    ...(stage.alethiaHelp ?? []),
    ...stageUserActions(stage),
    ...stage.completionCriteria.map((c) => c.description),
  ].join("\n");

  const stageMatches = inferPathwayConnectors(stageCorpus);
  if (stageMatches.length > 0) return stageMatches;

  const pathwayCorpus = [pathway.goal, pathway.title, pathway.domain].join("\n");
  return inferPathwayConnectors(pathwayCorpus);
}

export function pathwayConnectorById(id: string): PathwayConnectorDefinition | undefined {
  return PATHWAY_CONNECTOR_CATALOG.find((c) => c.id === id);
}
