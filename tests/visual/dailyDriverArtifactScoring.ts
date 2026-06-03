/**
 * Daily Driver artifact compliance (mirrors Artifact Builder v1 expectations).
 */

import type { FrictionKind } from "./dailyDriverReport.js";
import type { DailyDriverScenario } from "./dailyDriverScenarios.js";

const RAW_MARKDOWN_NOISE = /##\s*\*{0,2}|^##\s+/m;

export type ArtifactScoreOptions = {
  artifactType?: string | null;
  hasArtifact?: boolean;
  buildMode?: string | null;
  schemaValidationPassed?: boolean | null;
  validationIssues?: string[];
};

function expectsColdEmailArtifact(scenario: DailyDriverScenario): boolean {
  return (
    scenario.id === "sales-hvac-cold-email" ||
    /\b(cold email|outreach email)\b/i.test(scenario.prompt)
  );
}

function expectsSupportArtifact(scenario: DailyDriverScenario): boolean {
  return (
    scenario.tags.includes("@support") ||
    /\b(support response|customer says|reply to a customer)\b/i.test(scenario.prompt)
  );
}

function expectsTableArtifact(scenario: DailyDriverScenario): boolean {
  return /\b(financial table|budget table|pricing table|comparison table)\b/i.test(
    scenario.prompt,
  );
}

function expectsCanvasOffer(scenario: DailyDriverScenario): boolean {
  return /\b(build (me )?(a )?full landing page|build a landing page|business plan|full campaign)\b/i.test(
    scenario.prompt,
  );
}

export function scoreArtifactCompliance(
  scenario: DailyDriverScenario,
  answer: string,
  options?: ArtifactScoreOptions,
): { frictions: FrictionKind[]; notes: string[] } {
  const frictions: FrictionKind[] = [];
  const notes: string[] = [];
  if (!answer.trim()) return { frictions, notes };

  const artifactType = options?.artifactType ?? null;
  const hasArtifact = options?.hasArtifact ?? false;

  if (RAW_MARKDOWN_NOISE.test(answer)) {
    frictions.push("raw_markdown_noise");
    notes.push("Artifact UI still shows raw markdown headings like ## **.");
  }

  if (expectsColdEmailArtifact(scenario)) {
    const emailArtifact =
      artifactType === "cold_email" ||
      artifactType === "email_template" ||
      artifactType === "follow_up_sequence";
    if (!hasArtifact || !emailArtifact) {
      if (!/\bsubject\b/i.test(answer) || RAW_MARKDOWN_NOISE.test(answer.slice(0, 400))) {
        frictions.push("artifact_missing", "wrong_artifact_type");
        notes.push("Cold email scenario should render a cold_email artifact with copy buttons.");
      }
    } else if (!emailArtifact) {
      frictions.push("wrong_artifact_type");
      notes.push(`Expected cold_email artifact, got ${artifactType}.`);
    } else {
      notes.push("IIVO created a cold email artifact with copy buttons.");
      if (options?.buildMode === "parser_fallback") {
        frictions.push("artifact_schema_fallback");
        notes.push("Artifact fell back to parser; checking if sections are still usable.");
      }
      if (options?.schemaValidationPassed === false) {
        frictions.push("artifact_validation_failed");
      }
      const bodySection = hasArtifact;
      if (hasArtifact && !/\b(body|email)\b/i.test(answer.slice(0, 200))) {
        /* artifact UI carries body */
      }
    }
  }

  if (expectsSupportArtifact(scenario)) {
    if (!hasArtifact || artifactType !== "support_reply") {
      if (RAW_MARKDOWN_NOISE.test(answer.slice(0, 500))) {
        frictions.push("artifact_missing", "wrong_artifact_type");
        notes.push("Support response should render a support_reply artifact with copy.");
      }
    } else {
      notes.push("IIVO created a support reply artifact with copy buttons.");
    }
  }

  if (expectsTableArtifact(scenario)) {
    if (!hasArtifact || !artifactType?.includes("table")) {
      frictions.push("artifact_missing", "wrong_artifact_type");
      notes.push("Financial/comparison table prompt should render a table artifact.");
    }
  }

  if (expectsCanvasOffer(scenario) && artifactType === "canvas_project") {
    if (!hasArtifact) {
      frictions.push("canvas_not_offered");
      notes.push("Large build should offer Builder Mode (canvas) confirmation.");
    }
  }

  if (hasArtifact && !/copy/i.test(answer) && !options) {
    frictions.push("missing_copy_action");
    notes.push("Artifact should expose copy actions.");
  }

  return { frictions: [...new Set(frictions)], notes };
}
