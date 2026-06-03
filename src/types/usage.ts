export type UsagePlanId = "local_free";

export type UsageEventType =
  | "credits_estimated"
  | "credits_reserved"
  | "credits_deducted"
  | "credits_refunded"
  | "run_blocked_insufficient_credits"
  | "local_credits_added"
  | "local_credits_reset";

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

export interface CreditBreakdownLine {
  label: string;
  credits: number;
}

export interface CreditEstimateResponse {
  estimatedCredits: number;
  breakdown: CreditBreakdownLine[];
  workflowId: string;
  tokenMode: string;
  benchmarkEnabled: boolean;
  entitySearch: boolean;
  currentCredits?: number;
  remainingAfterRun?: number;
}

export interface UsageSummaryResponse {
  planId: UsagePlanId;
  currentCredits: number;
  monthlyCredits: number;
  usedCreditsThisMonth: number;
  resetDate: string;
  recentUsage: UsageEvent[];
  costTable?: CreditBreakdownLine[];
}

export interface RunUsageSummary {
  creditsCharged: number;
  creditsRemaining: number;
  planId: UsagePlanId;
  creditBreakdown: CreditBreakdownLine[];
  creditsRefunded?: number;
  estimatedProviderCostUsd?: number | null;
}

export interface InsufficientCreditsErrorResponse {
  error: string;
  code: "INSUFFICIENT_CREDITS";
  requiredCredits: number;
  currentCredits: number;
}

export const FUTURE_PRICING_TIERS = [
  "Free — limited monthly credits",
  "Starter — more monthly credits",
  "Pro / Founder — higher credits and advanced workflows",
  "Business — team controls (later)",
  "Enterprise — custom (later)",
] as const;
