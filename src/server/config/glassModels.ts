/**
 * IIVO Glass direct AI model configuration (text, vision, semantic, diagnostic).
 * Defaults to Claude Sonnet with fallback chain: primary → claude-opus-4-6 → claude-sonnet-4-6.
 */

import { MODELS } from "./models.js";

export const GLASS_DEFAULT_MODEL = "claude-sonnet-4-6";

/** Models excluded from the Glass chat route. */
export const GLASS_CHAT_MODEL_EXCLUDED = new Set<string>([]);

/** Probe / default order when env is unset (env override always wins first). */
export const GLASS_CHAT_MODEL_CANDIDATES = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const;

export const GLASS_VISION_MODEL_CANDIDATES = GLASS_CHAT_MODEL_CANDIDATES;

/** Fallback chain: sonnet fails → haiku (cheap + fast emergency net). Opus is NOT here — too expensive for a command bar fallback. */
export const GLASS_MODEL_FALLBACK_CHAIN = ["claude-haiku-4-5-20251001"] as const;

export const GLASS_MODEL_FINAL_FALLBACK = MODELS.anthropic.claudeSonnet4;

export type GlassModelPurpose = "default" | "semantic" | "diagnostic";

export type GlassModelKind = "text" | "vision";

export interface GlassModelRuntimeRecord {
  requestedModel: string;
  selectedModel: string;
  modelUsed: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  at: string;
}

const runtimeBySlot = new Map<string, GlassModelRuntimeRecord>();

function slotKey(kind: GlassModelKind, purpose: GlassModelPurpose): string {
  return `${kind}:${purpose}`;
}

export function recordGlassModelRuntime(
  kind: GlassModelKind,
  purpose: GlassModelPurpose,
  record: Omit<GlassModelRuntimeRecord, "at">,
): void {
  runtimeBySlot.set(slotKey(kind, purpose), { ...record, at: new Date().toISOString() });
}

export function getGlassModelRuntime(
  kind: GlassModelKind,
  purpose: GlassModelPurpose,
): GlassModelRuntimeRecord | null {
  return runtimeBySlot.get(slotKey(kind, purpose)) ?? null;
}

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
  return GLASS_DEFAULT_MODEL;
}

export function defaultGlassVisionModel(): string {
  return GLASS_DEFAULT_MODEL;
}

export function isExcludedGlassChatModel(model: string): boolean {
  return GLASS_CHAT_MODEL_EXCLUDED.has(model);
}

/** Primary model to attempt before fallback chain. */
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

/** Full try order: selected primary, then gpt-4.1, then gpt-4o (deduped). */
export function buildGlassModelTryChain(primary: string): string[] {
  const chain: string[] = [];
  for (const model of [primary, ...GLASS_MODEL_FALLBACK_CHAIN]) {
    if (!isExcludedGlassChatModel(model) && !chain.includes(model)) {
      chain.push(model);
    }
  }
  return chain;
}

export interface GlassModelSlotDiagnostics {
  envVar: string;
  configured: string | null;
  requestedModel: string;
  selectedModel: string;
  fallbackChain: string[];
  modelActuallyUsed: string | null;
  fallbackUsed: boolean | null;
  fallbackReason: string | null;
  lastUsedAt: string | null;
}

export interface GlassModelsDiagnostics {
  defaultModel: string;
  fallbackChain: string[];
  text: GlassModelSlotDiagnostics;
  vision: GlassModelSlotDiagnostics;
  diagnostic: GlassModelSlotDiagnostics;
  semantic: GlassModelSlotDiagnostics;
}

function slotDiagnostics(
  envVar: string,
  configured: string | null,
  kind: GlassModelKind,
  purpose: GlassModelPurpose,
): GlassModelSlotDiagnostics {
  const selected = resolveGlassModelPrimary(kind, purpose);
  const runtime = getGlassModelRuntime(kind, purpose);
  return {
    envVar,
    configured,
    requestedModel: selected,
    selectedModel: selected,
    fallbackChain: buildGlassModelTryChain(selected),
    modelActuallyUsed: runtime?.modelUsed ?? null,
    fallbackUsed: runtime?.fallbackUsed ?? null,
    fallbackReason: runtime?.fallbackReason ?? null,
    lastUsedAt: runtime?.at ?? null,
  };
}

export function getGlassModelsDiagnostics(): GlassModelsDiagnostics {
  return {
    defaultModel: GLASS_DEFAULT_MODEL,
    fallbackChain: [...GLASS_MODEL_FALLBACK_CHAIN],
    text: slotDiagnostics(
      "IIVO_GLASS_OPENAI_MODEL",
      getConfiguredGlassTextModel() ?? null,
      "text",
      "default",
    ),
    vision: slotDiagnostics(
      "IIVO_GLASS_VISION_MODEL",
      getConfiguredGlassVisionModel() ?? null,
      "vision",
      "default",
    ),
    diagnostic: slotDiagnostics(
      "IIVO_GLASS_DIAGNOSTIC_MODEL",
      getConfiguredGlassDiagnosticModel() ?? null,
      "text",
      "diagnostic",
    ),
    semantic: slotDiagnostics(
      "IIVO_GLASS_SEMANTIC_MODEL",
      getConfiguredGlassSemanticModel() ?? null,
      "text",
      "semantic",
    ),
  };
}

export function logGlassModelStatus(): void {
  const d = getGlassModelsDiagnostics();
  console.log(
    `[glass-models] default=${d.defaultModel} text=${d.text.selectedModel} vision=${d.vision.selectedModel} diagnostic=${d.diagnostic.selectedModel} semantic=${d.semantic.selectedModel} fallbackChain=${d.fallbackChain.join("→")}`,
  );
}

/** @deprecated use GLASS_MODEL_FINAL_FALLBACK */
export const GLASS_MODEL_FALLBACK = GLASS_MODEL_FINAL_FALLBACK;
