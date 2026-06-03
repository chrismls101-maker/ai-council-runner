export interface ProviderDisclosureRow {
  provider: string;
  usedFor: string;
  dataSent: string;
  notes: string;
}

export const PROVIDER_DISCLOSURE: ProviderDisclosureRow[] = [
  {
    provider: "OpenAI",
    usedFor: "Direct Answer, Router, Strategy, Final Judgment",
    dataSent: "prompt, selected memory/context, prior workflow outputs when needed",
    notes: "provider policy applies",
  },
  {
    provider: "Anthropic",
    usedFor: "critique, writing, planning, technical review",
    dataSent: "prompt, selected memory/context, prior workflow outputs when needed",
    notes: "provider policy applies",
  },
  {
    provider: "Perplexity",
    usedFor: "search, research, citations, entity_search",
    dataSent: "research query, selected context when needed",
    notes: "provider policy applies",
  },
];

export const DATA_USE_STATEMENT =
  "Provider APIs process requests according to their own policies. To generate responses, IIVO may send your prompt, selected memory/context, and workflow outputs to configured AI providers. IIVO does not operate its own model training pipeline — check each provider's API terms for retention and usage rules.";

export const SENSITIVE_DATA_GUIDANCE =
  "Avoid entering passwords, API keys, private customer data, or sensitive personal information.";

export const LAUNCH_CHECKLIST_ITEMS = [
  "Authentication",
  "User database",
  "Billing / credits",
  "Usage limits",
  "Rate limiting",
  "Terms of Service",
  "Privacy Policy",
  "Provider disclosure",
  "Export/delete account data",
  "Organization/team controls",
  "Admin audit logs",
  "Security review",
  "Production security assessment",
] as const;
