export type ReadinessStatus = "ready" | "needs_review" | "later";

export interface ReadinessChecklistItem {
  id: string;
  label: string;
  status: ReadinessStatus;
}

export interface ReadinessChecklistSection {
  id: string;
  title: string;
  items: ReadinessChecklistItem[];
}

export const READINESS_STATUS_LABELS: Record<ReadinessStatus, string> = {
  ready: "Ready",
  needs_review: "Needs review",
  later: "Later",
};

export const PUBLIC_READINESS_CHECKLIST: ReadinessChecklistSection[] = [
  {
    id: "product-clarity",
    title: "Product clarity",
    items: [
      { id: "first-run-onboarding", label: "First-run onboarding explains IIVO", status: "ready" },
      { id: "landing-empty-state", label: "Landing page shows what to ask", status: "ready" },
      { id: "router-helper", label: "Auto Router path helper is visible", status: "ready" },
    ],
  },
  {
    id: "usage-protection",
    title: "Usage protection",
    items: [
      { id: "credit-estimates", label: "Credit estimates before runs", status: "ready" },
      { id: "insufficient-credits", label: "Friendly insufficient-credit block", status: "ready" },
      { id: "local-simulation", label: "Local Free credits labeled as simulation", status: "ready" },
    ],
  },
  {
    id: "memory-controls",
    title: "Memory controls",
    items: [
      { id: "memory-toggle", label: "Memory on/off toggle in Settings", status: "ready" },
      { id: "memory-export-delete", label: "Export and delete memory", status: "ready" },
      { id: "outcome-caution", label: "Past outcomes not treated as proof by default", status: "needs_review" },
    ],
  },
  {
    id: "provider-disclosure",
    title: "Provider disclosure",
    items: [
      { id: "provider-table", label: "Provider disclosure table", status: "ready" },
      { id: "data-use-copy", label: "Factual data-use statement", status: "ready" },
      { id: "no-overclaims", label: "Compliance overclaims removed from product copy", status: "ready" },
    ],
  },
  {
    id: "error-handling",
    title: "Error handling",
    items: [
      { id: "provider-errors", label: "Provider failure messaging", status: "ready" },
      { id: "no-sources", label: "No-sources messaging", status: "ready" },
      { id: "router-uncertainty", label: "Router uncertainty messaging", status: "ready" },
    ],
  },
  {
    id: "benchmark-honesty",
    title: "Benchmark honesty",
    items: [
      { id: "heuristic-labels", label: "Benchmark scores labeled heuristic", status: "ready" },
      { id: "value-verdict", label: "Cost-adjusted value verdict shown", status: "ready" },
      { id: "scientific-proof", label: "Scientific proof claims avoided", status: "ready" },
    ],
  },
  {
    id: "export-delete",
    title: "Export/delete controls",
    items: [
      { id: "history-export", label: "Export run history", status: "ready" },
      { id: "history-delete", label: "Delete run history", status: "ready" },
      { id: "account-deletion", label: "Account-level deletion (requires auth)", status: "later" },
    ],
  },
  {
    id: "beta-launch",
    title: "Beta launch readiness",
    items: [
      { id: "auth-billing", label: "Authentication and billing", status: "later" },
      { id: "terms-privacy", label: "Terms of Service and Privacy Policy", status: "later" },
      { id: "production-storage", label: "Production storage and rate limits", status: "later" },
    ],
  },
];
