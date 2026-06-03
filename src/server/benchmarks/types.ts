import type { AgentCost } from "../types/index.js";

export type BenchmarkMode = "single_model_vs_iivo" | "direct_answer_vs_council";

export type BenchmarkWinner = "iivo" | "baseline" | "tie";

export type ValueVerdict = "worth_it" | "marginal" | "not_worth_it";

export interface BenchmarkScoreCategory {
  clarity: number;
  actionability: number;
  specificity: number;
  riskAwareness: number;
  sourceQuality: number;
  memoryContextUse: number;
  decisionConfidence: number;
  nextStepQuality: number;
  costEfficiency: number;
}

export interface CriteriaMatchResult {
  criterion: string;
  matched: boolean;
  note?: string;
}

export interface CriteriaEvaluation {
  baseline: CriteriaMatchResult[];
  iivo: CriteriaMatchResult[];
  baselineMatchedCount: number;
  iivoMatchedCount: number;
  missingBaseline: string[];
  missingIivo: string[];
  criteriaWinner: BenchmarkWinner;
}

export interface SubjectAlignmentSide {
  subjectAlignmentScore: number;
  wrongSubject: boolean;
  matchedExpected: string[];
  matchedForbidden: string[];
  matchedContextTerms: string[];
  requiredContextMin: number;
  insufficientProductContext: boolean;
  possibleInventedExpansion: boolean;
  detectedExpansion?: string;
  explanation?: string;
}

export interface SubjectAlignmentResult {
  baseline: SubjectAlignmentSide;
  iivo: SubjectAlignmentSide;
}

export interface UnsupportedAssumptionWarning {
  side: "baseline" | "iivo";
  message: string;
}

export type RecommendationStance = "build_now" | "wait" | "test_manual" | "unclear";

export interface RecommendationConflictAnalysis {
  conflictDetected: boolean;
  baselineStance: RecommendationStance;
  iivoStance: RecommendationStance;
  baselineRecommendation?: string;
  iivoRecommendation?: string;
  explanation?: string;
  baselineQualityBonus: number;
  iivoQualityBonus: number;
}

export interface BenchmarkScoringMeta {
  subjectAlignment: SubjectAlignmentResult;
  warnings: string[];
  unsupportedAssumptionWarnings: UnsupportedAssumptionWarning[];
  recommendationConflict?: RecommendationConflictAnalysis;
  qualityWinner: BenchmarkWinner;
  costWinner: BenchmarkWinner;
  valueVerdict: ValueVerdict;
  valueVerdictExplanation: string;
  /** Set when product-context alignment overrides raw heuristic score winner */
  winnerOverrideReason?: string;
}

export interface BenchmarkScores {
  baseline: BenchmarkScoreCategory;
  iivo: BenchmarkScoreCategory;
  baselineTotal: number;
  iivoTotal: number;
  baselineAverage: number;
  iivoAverage: number;
  scoringMethod: "deterministic" | "ai_judge" | "deterministic+ai_judge";
  /** Estimated score bonus from library success-criteria heuristics */
  criteriaBaselineBonus?: number;
  criteriaIivoBonus?: number;
}

export interface BenchmarkRunRecord {
  id: string;
  timestamp: string;
  prompt: string;
  promptLibraryId?: string;
  promptTitle?: string;
  expectedBestRoute?: string;
  successCriteria?: string[];
  benchmarkMode: BenchmarkMode;
  baselineModel: string;
  baselineAnswer: string;
  iivoWorkflowId: string;
  iivoAnswer: string;
  iivoRunId?: string;
  baselineCost?: AgentCost | null;
  iivoCost?: AgentCost | null;
  baselineCredits: number;
  iivoCredits: number;
  benchmarkOverheadCredits: number;
  totalCredits: number;
  scores: BenchmarkScores;
  criteriaEvaluation?: CriteriaEvaluation;
  scoringMeta?: BenchmarkScoringMeta;
  winner: BenchmarkWinner;
  scoreDifference: number;
  scoreDifferencePercent: number;
  costDifferenceUsd: number | null;
  summary: string;
  whyWinner: string;
  iivoImprovements: string[];
  iivoNotWorthExtra: string[];
  routerNote?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BenchmarkRunSummary {
  id: string;
  timestamp: string;
  promptPreview: string;
  benchmarkMode: BenchmarkMode;
  winner: BenchmarkWinner;
  scoreDifference: number;
  totalCredits: number;
  iivoWorkflowId: string;
}

export interface BenchmarkRunsFile {
  runs: BenchmarkRunRecord[];
}

export interface CreateBenchmarkInput {
  prompt?: string;
  promptLibraryId?: string;
  benchmarkMode?: BenchmarkMode;
  workflowId?: string;
  tokenMode?: unknown;
  preset?: string;
  memoryMode?: string;
  selectedMemoryIds?: string[];
}

export interface BenchmarkCreditEstimate {
  baselineCredits: number;
  iivoCredits: number;
  benchmarkOverheadCredits: number;
  judgeCredits: number;
  totalCredits: number;
  breakdown: Array<{ label: string; credits: number }>;
}
