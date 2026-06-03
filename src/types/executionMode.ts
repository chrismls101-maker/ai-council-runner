export type ExecutionMode = "auto" | "quick" | "council";

export type EffectiveExecutionMode = "quick" | "council" | "vision" | "research";

export type ExecutionModeDecision = {
  mode: ExecutionMode;
  effectiveMode: EffectiveExecutionMode;
  confidence: number;
  reason: string;
  requiresConfirmation?: boolean;
  confirmationKind?: "council";
  confirmationReason?: string;
  targetLatencySeconds?: number;
};

export type ExecutionModeTrace = {
  selectedExecutionMode: ExecutionMode;
  effectiveExecutionMode: EffectiveExecutionMode;
  modeDecisionReason: string;
  targetLatencySeconds?: number;
  confirmationShown?: boolean;
  confirmationAccepted?: boolean;
  confirmationKind?: "council";
};

export const EXECUTION_MODE_STORAGE_KEY = "iivo_execution_mode_v1";

export const EXECUTION_MODE_OPTIONS: {
  value: ExecutionMode;
  label: string;
  description: string;
}[] = [
  {
    value: "auto",
    label: "Auto",
    description: "IIVO chooses — quick by default. Asks before slower council runs.",
  },
  {
    value: "quick",
    label: "Quick Mode",
    description: "Fast answer — one AI. Best for writing, rewrite, summarize, explain, support.",
  },
  {
    value: "council",
    label: "Council Mode",
    description: "Deep reasoning — multi-agent thinking for decisions, strategy, and tradeoffs.",
  },
];

export function executionModeLabel(mode: ExecutionMode): string {
  return EXECUTION_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;
}

export function executionModeShortLabel(mode: ExecutionMode): string {
  switch (mode) {
    case "auto":
      return "Auto";
    case "quick":
      return "Quick";
    case "council":
      return "Council";
    default:
      return mode;
  }
}

/** Trigger icon for execution mode pill (landing + composer). */
export function executionModeIcon(mode: ExecutionMode): string {
  switch (mode) {
    case "auto":
    case "quick":
      return "⚡";
    case "council":
      return "◎";
    default:
      return "◎";
  }
}
