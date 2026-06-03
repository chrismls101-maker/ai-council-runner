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
  serverVersionRestore?: boolean;
  structuredTableDiff?: boolean;
  shareLinkAvailable?: boolean;
  mockTransformWithoutRestart?: boolean;
  childArtifactInChat?: boolean;
  imageStudioVisible?: boolean;
  imageBriefVisible?: boolean;
  imageDownloadVisible?: boolean;
  imageIpWarningVisible?: boolean;
  imageAttached?: boolean;
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
    if (signals.builderOpen && signals.executeActionsVisible && !signals.childArtifactInChat) {
      frictions.push("child_artifact_not_in_chat");
      notes.push("Execute transform should add child artifact to chat thread.");
    }
    if (signals.builderOpen && !signals.shareLinkAvailable) {
      frictions.push("share_link_missing");
      notes.push("Builder Share menu should allow creating a share link.");
    }
    if (signals.builderOpen && !signals.serverVersionRestore) {
      frictions.push("server_restore_metadata_only");
      notes.push("Version restore should use full server snapshot content.");
    }
    if (signals.builderOpen && !signals.structuredTableDiff) {
      frictions.push("table_diff_fallback");
      notes.push("Table/checklist compare should use structured diff when possible.");
    }
    if (!signals.mockTransformWithoutRestart) {
      frictions.push("mock_qa_requires_restart");
      notes.push("Mock transform QA should work via request header without dev restart.");
    }
  }

  if (scenario.id === "builder-financial-table" && signals.builderOpen && !signals.qualityPanelVisible) {
    frictions.push("missing_quality_panel");
    notes.push("Financial table Builder should flag missing assumptions in quality panel.");
  }

  if (
    scenario.id.startsWith("image-studio-") ||
    scenario.id === "vision-proposal-cover" ||
    /image studio|generate hero image|product render pack|proposal cover image/i.test(scenario.prompt)
  ) {
    if (!signals.imageStudioVisible) {
      frictions.push("image_generation_unavailable");
      notes.push("Image Studio tab should be available in Builder.");
    }
    if (signals.imageStudioVisible && !signals.imageBriefVisible) {
      frictions.push("missing_image_brief");
      notes.push("Image Studio should generate an editable brief before generation.");
    }
    if (signals.imageStudioVisible && !signals.imageDownloadVisible) {
      frictions.push("no_download_action");
      notes.push("Generated visuals should expose download/copy actions.");
    }
    if (/style of apple|like nike|official logo/i.test(scenario.prompt) && !signals.imageIpWarningVisible) {
      frictions.push("no_ip_warning");
      notes.push("Risky brand/style-copy prompts should show an IP warning.");
    }
    if (/attach visual|attach to artifact/i.test(scenario.prompt) && !signals.imageAttached) {
      frictions.push("image_not_attached");
      notes.push("Attach to artifact should add the visual to the source artifact.");
    }
  }

  return { frictions: [...new Set(frictions)], notes };
}
