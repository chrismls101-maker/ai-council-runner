/**
 * Glass Agent catalogue — shared UI metadata for the Agent Panel cards.
 */

import type { GlassAgentId } from "./ipc.ts";

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
    description: "Searches the web and saves a structured markdown report.",
    placeholder: 'What do you want to research? e.g. "Latest breakthroughs in quantum computing"',
  },
  {
    id: "code",
    icon: "⌥",
    name: "Code Analyst",
    description: "Reads your codebase, finds issues, and saves an analysis report.",
    placeholder: 'Describe what to analyse. e.g. "Review /Users/me/project/src for error handling gaps"',
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
    name: "Glass Coder",
    description: "Explores your project and applies edits with your approval.",
    placeholder: 'Describe the change. e.g. "Add error handling to the fetch call in api.ts"',
  },
];

export function agentCatalogName(agentId: GlassAgentId): string {
  return GLASS_AGENT_CATALOG.find((a) => a.id === agentId)?.name ?? agentId;
}
