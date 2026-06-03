import type { EffectiveExecutionMode, ExecutionMode } from "./executionMode.js";

export type ExecutionModeTrace = {
  selectedExecutionMode: ExecutionMode;
  effectiveExecutionMode: EffectiveExecutionMode;
  modeDecisionReason: string;
  targetLatencySeconds?: number;
  confirmationShown?: boolean;
  confirmationAccepted?: boolean;
  confirmationKind?: "council";
};
