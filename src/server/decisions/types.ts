import type { OutcomeStatus } from "../decisionQuality/types.js";
import type { RunCostSummary } from "../types/index.js";

export interface DecisionRecord {
  id: string;
  runId: string;
  timestamp: string;
  projectName?: string;
  workflowId: string;
  route: string;
  decisionTitle: string;
  originalPrompt: string;
  recommendedDecision?: string;
  reason?: string;
  confidence?: string;
  decisionScore?: number;
  riskLevel?: string;
  riskFlags: string[];
  sourcesUsed: string[];
  includedMemoryIds: string[];
  costSummary?: RunCostSummary | null;
  actionTaken?: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  outcomeStatus: OutcomeStatus;
  resultMetric?: string;
  lessonsLearned?: string;
  nextTimeRecommendation?: string;
  updatedAt: string;
}

export interface DecisionRecordsFile {
  records: DecisionRecord[];
}

export interface DecisionLearningStats {
  totalDecisions: number;
  outcomesLogged: number;
  workedCount: number;
  didNotWorkCount: number;
  needsRevisionCount: number;
  withoutOutcomes: number;
  topProjects: { name: string; count: number }[];
  recentLessons: { recordId: string; title: string; lesson: string; updatedAt: string }[];
}

export const COUNCIL_DECISION_WORKFLOWS = new Set([
  "sales-attack",
  "product-decision",
  "market-research",
  "competitive-intelligence",
  "technical-audit",
]);
