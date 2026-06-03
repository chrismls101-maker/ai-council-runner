export interface RoutingTestCase {
  id: string;
  prompt: string;
  expectedRoute: string;
  notes?: string;
  /** Explicit preset for routing matrix tests (default workspace is neutral). */
  preset?: "none" | "ai-front-desk-sales-test";
}

export const ROUTING_TEST_MATRIX: RoutingTestCase[] = [
  {
    id: "A",
    prompt: "Explain what IIVO is in one paragraph.",
    expectedRoute: "direct_answer",
  },
  {
    id: "B",
    prompt:
      "Rewrite this sentence to sound more professional: I need you to call me back.",
    expectedRoute: "direct_answer",
  },
  {
    id: "C",
    prompt:
      "Find one verified plumber in Fontana, CA with a website, phone number, and source URL.",
    expectedRoute: "sales-attack + entity_search",
    notes: "Research Scout uses Perplexity Search API for verified entities.",
  },
  {
    id: "D",
    prompt:
      "Should I add SMS follow-up to AI Front Desk now or after 5 pilot customers?",
    expectedRoute: "product-decision",
  },
  {
    id: "E",
    prompt: "Find customers for my AI receptionist and write outreach.",
    expectedRoute: "sales-attack",
  },
  {
    id: "F",
    prompt:
      "Research competitors to AI receptionist tools for local service businesses.",
    expectedRoute: "competitive-intelligence",
    notes: "market-research acceptable if framed as industry evidence only.",
  },
  {
    id: "G",
    prompt: "Audit my IIVO architecture and tell me what could break.",
    expectedRoute: "technical-audit",
  },
  {
    id: "H",
    prompt: "What is the difference between IIVO and ChatGPT?",
    expectedRoute: "direct_answer",
    notes: "product-decision if user asks for positioning strategy explicitly.",
  },
  {
    id: "I",
    prompt: "Who is it for?",
    expectedRoute: "direct_answer",
    notes: "With prior turn 'What is IIVO?' — should answer about IIVO target users.",
  },
  {
    id: "J",
    prompt: "Who is IIVO for?",
    expectedRoute: "direct_answer",
    preset: "ai-front-desk-sales-test",
    notes: "With AI Front Desk preset selected — should still answer about IIVO.",
  },
  {
    id: "K",
    prompt: "What makes IIVO different?",
    expectedRoute: "direct_answer",
    notes: "Should not inject AI Front Desk pilot-customer context.",
  },
];

export function workflowDisplayName(routeId: string): string {
  switch (routeId) {
    case "direct_answer":
      return "Direct Answer";
    case "sales-attack":
      return "Sales Attack";
    case "product-decision":
      return "Product Decision";
    case "market-research":
      return "Market Research";
    case "competitive-intelligence":
      return "Competitive Intelligence";
    case "technical-audit":
      return "Technical Audit";
    default:
      if (routeId.includes("entity_search")) return routeId.replace(/_/g, " ");
      return routeId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function formatRouterChatLabel(
  selectedWorkflow: string,
  confidence?: number,
): string {
  const name = workflowDisplayName(selectedWorkflow);
  const base = `IIVO routed this as: ${name}`;
  if (confidence != null && confidence > 0) {
    return `${base} · ${confidence}% confidence`;
  }
  return base;
}

export function routerWorkflowLabelFromId(
  id: string,
  workflows: { value: string; label: string }[],
): string {
  if (id === "direct_answer") return "Direct Answer";
  return workflows.find((w) => w.value === id)?.label ?? workflowDisplayName(id);
}
