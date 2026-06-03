/**
 * Builder workspace friction scoring for Daily Driver scenarios.
 */

import type { FrictionKind } from "./dailyDriverReport.js";
import type { DailyDriverScenario } from "./dailyDriverScenarios.js";

export type BuilderWorkspaceSignals = {
  builderOpen?: boolean;
  buildMapVisible?: boolean;
  qualityPanelVisible?: boolean;
  executeActionsVisible?: boolean;
  openInBuilderVisible?: boolean;
  versionHistoryVisible?: boolean;
};

function expectsBuilderWorkspace(scenario: DailyDriverScenario): boolean {
  return (
    scenario.id.startsWith("builder-") ||
    /\b(builder mode|open in builder|build map|quality panel)\b/i.test(scenario.prompt)
  );
}

export function scoreBuilderWorkspace(
  scenario: DailyDriverScenario,
  signals: BuilderWorkspaceSignals,
): { frictions: FrictionKind[]; notes: string[] } {
  const frictions: FrictionKind[] = [];
  const notes: string[] = [];
  if (!expectsBuilderWorkspace(scenario)) return { frictions, notes };

  if (scenario.id === "builder-landing-page" || /full landing page/i.test(scenario.prompt)) {
    if (!signals.builderOpen && !signals.buildMapVisible) {
      frictions.push("missing_build_map");
      notes.push("Landing page Builder flow should show Build Map.");
    }
    if (!signals.qualityPanelVisible) {
      frictions.push("missing_quality_panel");
      notes.push("Builder Inspect should show quality score.");
    }
  }

  if (scenario.id === "builder-cold-email" || scenario.id === "sales-hvac-cold-email") {
    if (!signals.openInBuilderVisible) {
      frictions.push("missing_open_in_builder");
      notes.push("Cold email artifact should expose Open in Builder.");
    }
    if (signals.builderOpen && !signals.qualityPanelVisible) {
      frictions.push("missing_quality_panel");
    }
    if (signals.builderOpen && !signals.executeActionsVisible) {
      frictions.push("missing_execute_actions");
    }
  }

  if (scenario.id === "builder-financial-table" && signals.builderOpen && !signals.qualityPanelVisible) {
    frictions.push("missing_quality_panel");
    notes.push("Financial table Builder should flag missing assumptions in quality panel.");
  }

  return { frictions: [...new Set(frictions)], notes };
}
