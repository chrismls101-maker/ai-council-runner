/**
 * Stage 2 — Haiku micro-classifier for ambiguous computer-use routing.
 */

import type { GlassConfig } from "../shared/config.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import { resolveAnthropicApiKey } from "./anthropicKeyStore.ts";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const CLASSIFIER_TIMEOUT_MS = 1000;

function buildClassifierPrompt(request: string, targetApp: string): string {
  return [
    "You are classifying a user request for a macOS AI assistant.",
    "Decide whether this request requires ONLY observation (reading the screen, reporting back, no state changes)",
    "or requires OPERATION (navigating, clicking, scrolling to find something, multi-step interaction).",
    "",
    "Rules:",
    "- If the task can be completed by focusing the target app once and reading the current visible state → OBSERVE",
    "- If the task requires any navigation, scrolling, opening items, or more than one UI interaction → OPERATE",
    "- If uncertain, choose OPERATE",
    "",
    `Request: "${request}"`,
    `Target app: "${targetApp}"`,
    "",
    "Respond with exactly one word: OBSERVE or OPERATE",
  ].join("\n");
}

function parseObserveOperate(text: string): "OBSERVE" | "OPERATE" | null {
  const word = text.trim().split(/\s+/)[0]?.toUpperCase();
  if (word === "OBSERVE") return "OBSERVE";
  if (word === "OPERATE") return "OPERATE";
  return null;
}

export async function classifyAmbiguousComputerUseWithHaiku(
  config: GlassConfig,
  request: string,
  targetApp: string,
  parentSignal?: AbortSignal,
): Promise<"OBSERVE" | "OPERATE"> {
  if (!resolveAnthropicApiKey()) return "OPERATE";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
  const onParentAbort = (): void => controller.abort();
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const response = await askIivoGlass(
      config,
      {
        prompt: buildClassifierPrompt(request, targetApp),
        responseStyle: "full",
        modelPurpose: "semantic",
        anthropicModel: HAIKU_MODEL,
        modelCallSource: "other",
      },
      controller.signal,
    );
    return parseObserveOperate(response.answer ?? "") ?? "OPERATE";
  } catch {
    return "OPERATE";
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}
