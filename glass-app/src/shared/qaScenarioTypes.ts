import type { GlassCopilotSessionType } from "./copilotSessionType.ts";

/** QA scenario categories (must match scripts/qa-scenarios/iivo-glass-scenarios.mjs). */
export const SCENARIO_CATEGORY_LIST = [
  "founder_strategy",
  "executive_review",
  "video_learning",
  "meeting_call",
  "research_comparison",
  "coding_building",
  "sales_review",
  "studying",
  "creator_content",
  "general_user",
  "diagnostic_setup_loop",
  "diagnostic_error_loop",
  "privacy_retention",
  "open_in_iivo",
  "visual_ask",
  "session_debrief",
  "active_listening",
] as const;

export type ScenarioCategory = (typeof SCENARIO_CATEGORY_LIST)[number];

export type QaTestKind = "simulated" | "controlled_visual_fixture";

export type QaExpectedSessionType = GlassCopilotSessionType;

export type QaScenario = {
  id: string;
  category: ScenarioCategory;
  title: string;
  userPrompt: string;
  transcriptChunks: string[];
  screenContextText: string;
  appName?: string;
  windowTitle?: string;
  expectedSessionType: QaExpectedSessionType;
  expectedInsightTypes: string[];
  expectedBehavior: string;
  passCriteria: string[];
  liveAllowed: boolean;
  requiresManual: boolean;
  testKind: QaTestKind;
  fixturePage: string | null;
  fixtureExpectedKeywords?: string[];
  copilotMode?: string;
  // --- Optional meeting-intelligence anchors (used by meeting QA + audits) ---
  participants?: string[];
  decisions?: string[];
  actionItems?: string[];
  owners?: string[];
  deadlines?: string[];
  blockers?: string[];
  /** Substrings a strong answer is expected to surface (facts or missing-field call-outs). */
  expectedAnchors?: string[];
};

export type QaModeName = "quick" | "standard" | "deep" | "overnight";

export type ModeScenarioLimit = {
  maxScenarios: number;
  liveAiCap: number;
  livePerCategoryCap: number;
  scenariosPerCycle: number;
};

export type ModeScenarioLimits = Record<QaModeName, ModeScenarioLimit>;

export type ScenarioBankValidation = {
  ok: boolean;
  errors: string[];
  count: number;
};

export type FixturePageDef = {
  path: string;
  keywords: string[];
  label: string;
};

export type FixturePagesMap = Record<string, FixturePageDef>;
