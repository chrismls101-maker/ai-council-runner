export type ConfidenceLevel = "Low" | "Medium" | "High";
export type RiskLevel = "Low" | "Medium" | "High";

export type OutcomeStatus =
  | "not_started"
  | "in_progress"
  | "worked"
  | "did_not_work"
  | "needs_revision";

export interface BusinessContext {
  name: string;
  offer: string;
  targetCustomer: string;
  pricing: string;
  currentGoal: string;
  constraints: string;
  notes: string;
}

export interface DecisionOutcome {
  status: OutcomeStatus;
  notes?: string;
  resultMetric?: string;
  actionTaken?: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  lessonsLearned?: string;
  nextTimeRecommendation?: string;
  updatedAt?: string;
}

export interface NextMove {
  doThisFirst?: string;
  timeEstimate?: string;
  expectedResult?: string;
  ifItFails?: string;
}

export interface DecisionQuality {
  recommendedAction?: string;
  confidence?: ConfidenceLevel;
  decisionScore?: number;
  whyThisScore?: string;
  mainRisk?: string;
  missingInformation?: string;
  nextAction24h?: string;
  whatWouldChangeDecision?: string;
  riskFlags: string[];
  riskLevel?: RiskLevel;
  nextMove?: NextMove;
}

export const OUTCOME_STATUS_LABELS: Record<OutcomeStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  worked: "Worked",
  did_not_work: "Did not work",
  needs_revision: "Needs revision",
};

export const EMPTY_BUSINESS_CONTEXT: BusinessContext = {
  name: "",
  offer: "",
  targetCustomer: "",
  pricing: "",
  currentGoal: "",
  constraints: "",
  notes: "",
};

export function hasBusinessContext(ctx: BusinessContext | undefined): boolean {
  if (!ctx) return false;
  return Object.values(ctx).some((v) => v.trim().length > 0);
}

export function businessContextLabel(ctx: BusinessContext | undefined): string | null {
  if (!ctx?.name?.trim()) return null;
  return ctx.name.trim();
}
