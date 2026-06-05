/**
 * Typed facade for the QA scenario bank (.mjs runtime + shared types).
 * Tests and TS consumers should import from here, not the raw .mjs path.
 */
export type {
  FixturePageDef,
  FixturePagesMap,
  ModeScenarioLimit,
  ModeScenarioLimits,
  QaExpectedSessionType,
  QaModeName,
  QaScenario,
  QaTestKind,
  ScenarioBankValidation,
  ScenarioCategory,
} from "./qaScenarioTypes.ts";

export {
  FIXTURE_PAGES,
  getOrderedScenarios,
  getScenarioBatch,
  getScenarioById,
  MODE_SCENARIO_LIMITS,
  mulberry32,
  PROMPT_VARIETY,
  SCENARIO_CATEGORIES,
  SCENARIOS,
  scenariosByCategory,
  shuffleWithSeed,
  validateScenarioBank,
} from "../../scripts/qa-scenarios/iivo-glass-scenarios.mjs";
