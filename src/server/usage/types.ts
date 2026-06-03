export type UsagePlanId = "local_free";

export type UsageEventType =
  | "credits_estimated"
  | "credits_reserved"
  | "credits_deducted"
  | "credits_refunded"
  | "run_blocked_insufficient_credits"
  | "local_credits_added"
  | "local_credits_reset";

export interface UsageState {
  planId: UsagePlanId;
  currentCredits: number;
  monthlyCredits: number;
  usedCreditsThisMonth: number;
  resetDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface UsageEvent {
  id: string;
  timestamp: string;
  eventType: UsageEventType;
  runId?: string;
  workflowId?: string;
  tokenMode?: string;
  credits?: number;
  balanceAfter?: number;
  metadata?: string;
}

export interface UsageEventsFile {
  events: UsageEvent[];
}

export interface CreditBreakdownLine {
  label: string;
  credits: number;
}

export interface CreditEstimate {
  estimatedCredits: number;
  breakdown: CreditBreakdownLine[];
  workflowId: string;
  tokenMode: string;
  benchmarkEnabled: boolean;
  entitySearch: boolean;
}

export interface RunUsageSummary {
  creditsCharged: number;
  creditsRemaining: number;
  planId: UsagePlanId;
  creditBreakdown: CreditBreakdownLine[];
  creditsRefunded?: number;
  estimatedProviderCostUsd?: number | null;
}

export interface UsageApiResponse {
  planId: UsagePlanId;
  currentCredits: number;
  monthlyCredits: number;
  usedCreditsThisMonth: number;
  resetDate: string;
  recentUsage: UsageEvent[];
}

export class InsufficientCreditsError extends Error {
  readonly code = "INSUFFICIENT_CREDITS" as const;
  readonly requiredCredits: number;
  readonly currentCredits: number;

  constructor(requiredCredits: number, currentCredits: number) {
    super(
      "Not enough credits for this run. Switch to Direct Answer/Quick mode or add more credits.",
    );
    this.name = "InsufficientCreditsError";
    this.requiredCredits = requiredCredits;
    this.currentCredits = currentCredits;
  }
}
