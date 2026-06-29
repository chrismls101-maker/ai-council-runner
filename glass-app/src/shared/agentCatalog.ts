/**
 * Glass Agent catalogue — shared UI metadata for the Agent Panel cards.
 */

import type { GlassAgentId } from "./ipc.ts";
import { ALETHEIA_CORE_STRIP } from "./builderStripVisibility.ts";

export interface AgentCatalogEntry {
  id: GlassAgentId;
  icon: string;
  name: string;
  description: string;
  placeholder: string;
}

export const GLASS_AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    id: "research",
    icon: "◎",
    name: "Research Agent",
    description: "Opens the full-screen Aletheia research workspace.",
    placeholder: 'What do you want to research? e.g. "Latest breakthroughs in quantum computing"',
  },
  {
    id: "code",
    icon: "⌥",
    name: "Code Analyst",
    description: "Opens the full-screen codebase analysis workspace.",
    placeholder: 'Describe what to analyse. e.g. "Review error handling in the auth module"',
  },
  {
    id: "writing",
    icon: "✦",
    name: "Writing Agent",
    description: "Drafts blogs, emails, essays, or any document — saved locally.",
    placeholder: 'Describe what to write. e.g. "Write a product launch email for IIVO Glass v0.7"',
  },
  {
    id: "coder",
    icon: "⟁",
    name: "Glass Coder IDE",
    description: "Full coding workspace — edit files, run terminal builds, and stream agent changes with your approval.",
    placeholder: 'Describe the change. e.g. "Add error handling to the fetch call in api.ts"',
  },
];

/** Agents shown on the builder strip in Aletheia core mode. */
export const ALETHEIA_CORE_AGENT_IDS: GlassAgentId[] = ["research", "writing"];

export function builderStripAgentCatalog(): AgentCatalogEntry[] {
  if (!ALETHEIA_CORE_STRIP) return GLASS_AGENT_CATALOG;
  return GLASS_AGENT_CATALOG.filter((entry) => ALETHEIA_CORE_AGENT_IDS.includes(entry.id));
}

export function agentCatalogName(agentId: GlassAgentId): string {
  return GLASS_AGENT_CATALOG.find((a) => a.id === agentId)?.name ?? agentId;
}

/** Agents that need `agentCodeWorkspaceRoot` for semantic index bootstrap and scoped browsing. */
export function agentRequiresCodeWorkspace(agentId: GlassAgentId): boolean {
  return agentId === "code" || agentId === "coder";
}

/** Agents that open a dedicated full-screen workspace instead of an inline card panel. */
export function agentOpensDedicatedWorkspace(agentId: GlassAgentId): boolean {
  return agentId === "coder" || agentId === "research" || agentId === "code" || agentId === "writing";
}
