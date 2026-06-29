/**
 * Glass Pathways generation — structured JSON via local Glass ask.
 */

import { shell } from "electron";
import type { GlassConfig } from "../shared/config.ts";
import { isPathwaySettingsTarget } from "../shared/glassPathwaysEscort.ts";
import {
  buildStageExplainPrompt,
  buildStageStuckPrompt,
} from "../shared/glassPathwaysGuidance.ts";
import { parseGeneratedPathway } from "../shared/glassPathwaysParse.ts";
import {
  buildPathwayAskRequest,
  buildPathwayRefinementPrompt,
} from "../shared/glassPathwaysPrompts.ts";
import { assessPathwayQuality } from "../shared/glassPathwaysQuality.ts";
import type {
  GlassPathway,
  GlassPathwayStage,
  PathwayStageGuidanceMode,
} from "../shared/glassPathwaysTypes.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import { openGlassSystemSettings } from "./glassSystemSettings.ts";

const MAX_GENERATION_ATTEMPTS = 2;

export { buildPathwayAskRequest };

async function requestPathwayJson(
  config: GlassConfig,
  prompt: string,
): Promise<{ raw: string; error?: string }> {
  const response = await askIivoGlass(config, {
    prompt,
    modelPurpose: "pathway",
    responseStyle: "full",
    suppressUserProfile: true,
  });

  const raw = response.answer?.trim() ?? "";
  if (!raw) return { raw: "", error: "Empty response from AI" };
  return { raw };
}

export async function generateGlassPathway(
  config: GlassConfig,
  goal: string,
): Promise<{ pathway?: GlassPathway; error?: string }> {
  const trimmed = goal.trim();
  if (!trimmed) return { error: "Goal is required" };

  const askRequest = buildPathwayAskRequest(trimmed);
  const { domainHint } = askRequest;
  let prompt = askRequest.prompt;
  let lastError: string | undefined;
  let bestPathway: GlassPathway | null = null;
  let bestIssueCount = Number.POSITIVE_INFINITY;

  try {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const { raw, error } = await requestPathwayJson(config, prompt);
      if (error) {
        lastError = error;
        continue;
      }

      const pathway = parseGeneratedPathway(trimmed, raw);
      if (!pathway) {
        lastError = "Could not parse pathway — try again with a clearer goal";
        continue;
      }

      const quality = assessPathwayQuality(pathway);
      if (quality.ok) {
        return { pathway };
      }

      if (quality.issues.length < bestIssueCount) {
        bestPathway = pathway;
        bestIssueCount = quality.issues.length;
      }

      if (attempt < MAX_GENERATION_ATTEMPTS - 1) {
        prompt = buildPathwayRefinementPrompt(trimmed, quality.issues, domainHint);
        continue;
      }

      lastError = `Pathway quality check failed: ${quality.issues.slice(0, 3).join("; ")}`;
    }

    if (bestPathway) {
      return { pathway: bestPathway };
    }

    return { error: lastError ?? "Pathway generation failed" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Pathway generation failed" };
  }
}

export async function generateStageGuidance(
  config: GlassConfig,
  pathway: GlassPathway,
  stage: GlassPathwayStage,
  mode: PathwayStageGuidanceMode,
): Promise<{ answer?: string; error?: string }> {
  const prompt =
    mode === "stuck"
      ? buildStageStuckPrompt(pathway, stage)
      : buildStageExplainPrompt(pathway, stage);

  try {
    const response = await askIivoGlass(config, {
      prompt,
      modelPurpose: "default",
      responseStyle: "full",
      suppressUserProfile: true,
    });
    const answer = response.answer?.trim() ?? "";
    if (!answer) return { error: "Empty response from AI" };
    return { answer };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Guidance request failed" };
  }
}

export async function launchPathwayEscortTarget(
  kind: "url" | "settings",
  destination: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (kind === "settings") {
    if (!isPathwaySettingsTarget(destination)) {
      return { ok: false, error: "Unknown settings destination" };
    }
    const opened = await openGlassSystemSettings(destination);
    return opened.ok
      ? { ok: true, message: opened.message }
      : { ok: false, error: opened.message };
  }

  try {
    await shell.openExternal(destination);
    return { ok: true, message: `Opened ${destination}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not open destination",
    };
  }
}
