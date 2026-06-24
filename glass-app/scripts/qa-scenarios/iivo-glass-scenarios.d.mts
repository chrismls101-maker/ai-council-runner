import type {
  FixturePagesMap,
  ModeScenarioLimits,
  QaModeName,
  QaScenario,
  ScenarioBankValidation,
  ScenarioCategory,
} from "../../src/shared/qaScenarioTypes.ts";

export declare const SCENARIO_CATEGORIES: readonly ScenarioCategory[];
export declare const PROMPT_VARIETY: readonly string[];
export declare const FIXTURE_PAGES: FixturePagesMap;
export declare const SCENARIOS: QaScenario[];

export declare function mulberry32(seed: number): () => number;

export declare function shuffleWithSeed<T>(items: readonly T[], seed: number): T[];

export declare function getScenarioById(id: string): QaScenario | null;

export declare function scenariosByCategory(category: ScenarioCategory): QaScenario[];

export declare function validateScenarioBank(): ScenarioBankValidation;

export declare const MODE_SCENARIO_LIMITS: ModeScenarioLimits;

export declare function getOrderedScenarios(mode: QaModeName, seed: number): QaScenario[];

export declare function getScenarioBatch(
  ordered: readonly QaScenario[],
  offset: number,
  count: number,
): QaScenario[];
