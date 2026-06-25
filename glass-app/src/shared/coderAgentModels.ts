/**
 * Glass Coder agent model selection — Anthropic + OpenAI models + cost estimates.
 * Model IDs and API slugs aligned with provider lineups (June 2026).
 */

export type CoderAgentModelId = "auto" | "sonnet" | "opus" | "fable" | "haiku" | "gpt55";

export type CoderAgentConcreteModelId = Exclude<CoderAgentModelId, "auto">;

export type CoderAgentModelProvider = "anthropic" | "openai";

export interface CoderAgentModelDef {
  id: CoderAgentConcreteModelId;
  label: string;
  apiModel: string;
  provider: CoderAgentModelProvider;
  /** Micro-chips for picker, e.g. Fast · 1M · Standard */
  chips: string;
  description: string;
  /** Native context window (tokens). */
  contextWindowTokens: number;
  /** Picker section heading. */
  section: "standard" | "powerful" | "fast" | "openai";
  /** USD per million input tokens (approximate). */
  inputPerMillionUsd: number;
  /** USD per million output tokens (approximate). */
  outputPerMillionUsd: number;
}

export const AUTO_MODEL_DESCRIPTION =
  "Automatically selects the best model for each step. Uses Sonnet 4.6 for most tasks, Opus 4.8 for complex reasoning, Haiku 4.5 for fast completions. Stays on Anthropic models.";

export const CODER_AGENT_MODELS: Record<CoderAgentConcreteModelId, CoderAgentModelDef> = {
  sonnet: {
    id: "sonnet",
    label: "Sonnet 4.6",
    apiModel: "claude-sonnet-4-6",
    provider: "anthropic",
    chips: "Fast · 1M · Standard",
    description: "Best for most coding tasks",
    contextWindowTokens: 1_000_000,
    section: "standard",
    inputPerMillionUsd: 3,
    outputPerMillionUsd: 15,
  },
  opus: {
    id: "opus",
    label: "Opus 4.8",
    apiModel: "claude-opus-4-8",
    provider: "anthropic",
    chips: "Deep · 200K · Powerful",
    description: "Complex refactors, analysis",
    contextWindowTokens: 200_000,
    section: "powerful",
    inputPerMillionUsd: 15,
    outputPerMillionUsd: 75,
  },
  fable: {
    id: "fable",
    label: "Fable 5",
    apiModel: "claude-fable-5",
    provider: "anthropic",
    chips: "Frontier · 1M · Reasoning",
    description: "Hardest tasks, always-on reasoning",
    contextWindowTokens: 1_000_000,
    section: "powerful",
    inputPerMillionUsd: 18,
    outputPerMillionUsd: 90,
  },
  haiku: {
    id: "haiku",
    label: "Haiku 4.5",
    apiModel: "claude-haiku-4-5",
    provider: "anthropic",
    chips: "Instant · 200K · Fast",
    description: "Simple edits, quick answers",
    contextWindowTokens: 200_000,
    section: "fast",
    inputPerMillionUsd: 0.8,
    outputPerMillionUsd: 4,
  },
  gpt55: {
    id: "gpt55",
    label: "GPT 5.5",
    apiModel: "gpt-5.5",
    provider: "openai",
    chips: "OpenAI · 1M · Flagship",
    description: "OpenAI flagship for coding",
    contextWindowTokens: 1_000_000,
    section: "openai",
    inputPerMillionUsd: 2.5,
    outputPerMillionUsd: 10,
  },
};

export const DEFAULT_CODER_AGENT_MODEL: CoderAgentModelId = "auto";

const CONCRETE_MODEL_IDS = Object.keys(CODER_AGENT_MODELS) as CoderAgentConcreteModelId[];

export function parseCoderAgentModelId(value: unknown): CoderAgentModelId {
  if (
    value === "auto" || value === "opus" || value === "sonnet" || value === "fable"
    || value === "haiku" || value === "gpt55"
  ) {
    return value;
  }
  return DEFAULT_CODER_AGENT_MODEL;
}

export function resolveCoderAgentModelId(settingsValue: unknown): CoderAgentModelId {
  return parseCoderAgentModelId(settingsValue);
}

/** Route Auto to a concrete model from prompt heuristics. */
export function resolveAutoCoderModel(prompt?: string): CoderAgentConcreteModelId {
  const text = prompt?.trim().toLowerCase() ?? "";
  if (!text) return "sonnet";

  const simple = text.length < 140
    && /\b(typo|rename|format|lint|small fix|one line|quick)\b/.test(text);
  if (simple) return "haiku";

  const complex = text.length > 800
    || /\b(refactor|architecture|migrate|security|audit|analyze|review entire|multi-file|complex|frontier)\b/.test(text);
  if (complex) return "opus";

  return "sonnet";
}

export function resolveEffectiveCoderModelId(
  modelId: CoderAgentModelId,
  prompt?: string,
): CoderAgentConcreteModelId {
  if (modelId === "auto") return resolveAutoCoderModel(prompt);
  return modelId;
}

export function resolveCoderAgentApiModel(
  modelId: CoderAgentModelId,
  prompt?: string,
): string {
  return CODER_AGENT_MODELS[resolveEffectiveCoderModelId(modelId, prompt)].apiModel;
}

export function resolveCoderAgentModelDef(
  modelId: CoderAgentModelId,
  prompt?: string,
): CoderAgentModelDef {
  return CODER_AGENT_MODELS[resolveEffectiveCoderModelId(modelId, prompt)];
}

export function resolveCoderAgentProvider(
  modelId: CoderAgentModelId,
  prompt?: string,
): CoderAgentModelProvider {
  return resolveCoderAgentModelDef(modelId, prompt).provider;
}

export function resolveContextWindowTokens(
  modelId: CoderAgentModelId,
  prompt?: string,
): number {
  if (modelId === "auto") {
    return CODER_AGENT_MODELS.sonnet.contextWindowTokens;
  }
  return CODER_AGENT_MODELS[modelId].contextWindowTokens;
}

/** Rough client-side estimate for composer counter (chars / 4). */
export function estimateComposerPromptTokens(prompt: string): number {
  const trimmed = prompt.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / 4);
}

export function formatComposerTokenCounter(
  usedTokens: number,
  maxTokens: number,
): string {
  return `${formatTokenCount(usedTokens)} / ${formatTokenCount(maxTokens)}`;
}

export function modelPickerLabel(modelId: CoderAgentModelId): string {
  if (modelId === "auto") return "Auto";
  return CODER_AGENT_MODELS[modelId].label;
}

export function estimateCoderRunCostUsd(
  modelId: CoderAgentModelId,
  inputTokens: number,
  outputTokens: number,
  prompt?: string,
): number {
  const def = CODER_AGENT_MODELS[resolveEffectiveCoderModelId(modelId, prompt)];
  const inputCost = (inputTokens / 1_000_000) * def.inputPerMillionUsd;
  const outputCost = (outputTokens / 1_000_000) * def.outputPerMillionUsd;
  return inputCost + outputCost;
}

/** Estimate USD for any known API model id (ask, council, memory). */
export function estimateApiModelCostUsd(
  apiModel: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const normalized = apiModel.trim().toLowerCase();
  const byApiModel = Object.values(CODER_AGENT_MODELS).find(
    (m) => m.apiModel.toLowerCase() === normalized,
  );
  if (byApiModel) {
    return (
      (inputTokens / 1_000_000) * byApiModel.inputPerMillionUsd
      + (outputTokens / 1_000_000) * byApiModel.outputPerMillionUsd
    );
  }
  if (normalized.includes("haiku")) {
    return estimateCoderRunCostUsd("haiku", inputTokens, outputTokens);
  }
  if (normalized.includes("opus")) {
    return estimateCoderRunCostUsd("opus", inputTokens, outputTokens);
  }
  if (normalized.includes("gpt")) {
    return estimateCoderRunCostUsd("gpt55", inputTokens, outputTokens);
  }
  return estimateCoderRunCostUsd("sonnet", inputTokens, outputTokens);
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatCoderRunUsageUsd(usd: number): string {
  if (usd < 0.0001) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

export interface CoderRunUsage {
  runId: string;
  modelId: CoderAgentModelId;
  apiModel: string;
  label: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  updatedAt: number;
}

export function formatCoderRunUsageLine(usage: CoderRunUsage): string {
  const inTok = formatTokenCount(usage.inputTokens);
  const outTok = formatTokenCount(usage.outputTokens);
  const cost = formatCoderRunUsageUsd(usage.estimatedUsd);
  return `${usage.label} · ${inTok} in / ${outTok} out · est. ${cost}`;
}

export const CODER_MODEL_PICKER_SECTIONS: Array<{
  id: "auto" | CoderAgentModelDef["section"];
  label: string;
  models: CoderAgentModelId[];
}> = [
  { id: "auto", label: "", models: ["auto"] },
  { id: "standard", label: "Standard", models: ["sonnet"] },
  { id: "powerful", label: "Powerful", models: ["opus", "fable"] },
  { id: "fast", label: "Fast", models: ["haiku"] },
  { id: "openai", label: "OpenAI", models: ["gpt55"] },
];

export function isConcreteCoderModelId(id: CoderAgentModelId): id is CoderAgentConcreteModelId {
  return CONCRETE_MODEL_IDS.includes(id as CoderAgentConcreteModelId);
}
