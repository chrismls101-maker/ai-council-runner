/** Agent cards for intro agents panel — matches real catalog + coming-soon runway. */

export type IntroAgentCard = {
  id: string;
  icon: string;
  name: string;
  description: string;
  status: "live" | "soon";
};

export const INTRO_AGENT_CATALOG: IntroAgentCard[] = [
  {
    id: "research",
    icon: "◎",
    name: "Research Agent",
    description: "Full-screen Aletheia research workspace — deep dives with citations.",
    status: "live",
  },
  {
    id: "code",
    icon: "⌥",
    name: "Code Analyst",
    description: "Codebase analysis workspace — architecture, bugs, and refactors.",
    status: "live",
  },
  {
    id: "writing",
    icon: "✦",
    name: "Writing Agent",
    description: "Blogs, emails, essays — drafted locally with your voice.",
    status: "live",
  },
  {
    id: "coder",
    icon: "⟁",
    name: "Glass Coder IDE",
    description: "Built-in IDE — edit files, terminal builds, agent diffs with approval.",
    status: "live",
  },
  {
    id: "design",
    icon: "◫",
    name: "Design Agent",
    description: "Figma + screen context → specs, tokens, and component drafts.",
    status: "soon",
  },
  {
    id: "data",
    icon: "⬡",
    name: "Data Agent",
    description: "SQL, pipelines, and dashboards from natural language.",
    status: "soon",
  },
  {
    id: "qa",
    icon: "⊕",
    name: "QA Agent",
    description: "Test plans, Playwright flows, and regression from your UI.",
    status: "soon",
  },
  {
    id: "devops",
    icon: "⚙",
    name: "DevOps Agent",
    description: "Deploy, monitor, and incident runbooks from the overlay.",
    status: "soon",
  },
  {
    id: "meeting",
    icon: "▷",
    name: "Meeting Agent",
    description: "Live meeting notes, action items, and follow-up drafts.",
    status: "soon",
  },
  {
    id: "custom",
    icon: "✧",
    name: "Custom Agents",
    description: "Build your own council agents — SDK coming.",
    status: "soon",
  },
];
