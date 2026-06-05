/**
 * IIVO Glass direct AI model configuration (text, vision, semantic, diagnostic).
 * Env overrides with safe fallback to gpt-4o when the primary model is unavailable.
 */

import { MODELS } from "./models.js";

export const GLASS_MODEL_FALLBACK = MODELS.openai.gpt4o;

export type GlassModelPurpose = "default" | "semantic" | "diagnostic";

export type GlassModelKind = "text" | "vision";

/** When env is unset — probed by check-openai-models.mjs; runtime falls back if unavailable. */
export const GLASS_TEXT_MODEL_CANDIDATES = ["gpt-4.1", "gpt-4.1-mini", "gpt-4o"] as const;

export const GLASS_VISION_MODEL_CANDIDATES = ["gpt-4.1", "gpt-4o"] as const;

export function getConfiguredGlassTextModel(): string | undefined {
  return process.env.IIVO_GLASS_OPENAI_MODEL?.trim() || undefined;
}

export function getConfiguredGlassVisionModel(): string | undefined {
  return (
    process.env.IIVO_GLASS_VISION_MODEL?.trim() ||
    process.env.IMAGE_VISION_MODEL?.trim() ||
    undefined
  );
}

export function getConfiguredGlassDiagnosticModel(): string | undefined {
  return process.env.IIVO_GLASS_DIAGNOSTIC_MODEL?.trim() || undefined;
}

export function getConfiguredGlassSemanticModel(): string | undefined {
  return process.env.IIVO_GLASS_SEMANTIC_MODEL?.trim() || undefined;
}

export function defaultGlassTextModel(): string {
  return GLASS_TEXT_MODEL_CANDIDATES[0];
}

export function defaultGlassVisionModel(): string {
  return GLASS_VISION_MODEL_CANDIDATES[0];
}

/** Primary model to attempt before fallback. */
export function resolveGlassModelPrimary(
  kind: GlassModelKind,
  purpose: GlassModelPurpose = "default",
): string {
  if (purpose === "semantic") {
    return (
      getConfiguredGlassSemanticModel() ??
      getConfiguredGlassTextModel() ??
      defaultGlassTextModel()
    );
  }

  if (purpose === "diagnostic") {
    if (kind === "vision") {
      return (
        getConfiguredGlassDiagnosticModel() ??
        getConfiguredGlassVisionModel() ??
        getConfiguredGlassTextModel() ??
        defaultGlassVisionModel()
      );
    }
    return (
      getConfiguredGlassDiagnosticModel() ??
      getConfiguredGlassTextModel() ??
      defaultGlassTextModel()
    );
  }

  if (kind === "vision") {
    return (
      getConfiguredGlassVisionModel() ??
      getConfiguredGlassTextModel() ??
      defaultGlassVisionModel()
    );
  }

  return getConfiguredGlassTextModel() ?? defaultGlassTextModel();
}

export interface GlassModelSlotDiagnostics {
  envVar: string;
  configured: string | null;
  primary: string;
  fallback: string;
}

export interface GlassModelsDiagnostics {
  fallback: string;
  text: GlassModelSlotDiagnostics;
  vision: GlassModelSlotDiagnostics;
  diagnostic: GlassModelSlotDiagnostics;
  semantic: GlassModelSlotDiagnostics;
}

export function getGlassModelsDiagnostics(): GlassModelsDiagnostics {
  return {
    fallback: GLASS_MODEL_FALLBACK,
    text: {
      envVar: "IIVO_GLASS_OPENAI_MODEL",
      configured: getConfiguredGlassTextModel() ?? null,
      primary: resolveGlassModelPrimary("text", "default"),
      fallback: GLASS_MODEL_FALLBACK,
    },
    vision: {
      envVar: "IIVO_GLASS_VISION_MODEL",
      configured: getConfiguredGlassVisionModel() ?? null,
      primary: resolveGlassModelPrimary("vision", "default"),
      fallback: GLASS_MODEL_FALLBACK,
    },
    diagnostic: {
      envVar: "IIVO_GLASS_DIAGNOSTIC_MODEL",
      configured: getConfiguredGlassDiagnosticModel() ?? null,
      primary: resolveGlassModelPrimary("text", "diagnostic"),
      fallback: GLASS_MODEL_FALLBACK,
    },
    semantic: {
      envVar: "IIVO_GLASS_SEMANTIC_MODEL",
      configured: getConfiguredGlassSemanticModel() ?? null,
      primary: resolveGlassModelPrimary("text", "semantic"),
      fallback: GLASS_MODEL_FALLBACK,
    },
  };
}

export function logGlassModelStatus(): void {
  const d = getGlassModelsDiagnostics();
  console.log(
    `[glass-models] text=${d.text.primary} vision=${d.vision.primary} diagnostic=${d.diagnostic.primary} semantic=${d.semantic.primary} fallback=${d.fallback}`,
  );
}
