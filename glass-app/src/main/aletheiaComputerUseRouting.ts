/**
 * Async computer-use routing — Stage 1 rules + Stage 2 Haiku for ambiguous cases.
 */

import type { GlassConfig } from "../shared/config.ts";
import type {
  ClassifyComputerUseOptions,
  ComputerUseClassification,
  ComputerUseRoute,
} from "../shared/aletheiaComputerUseClassifier.ts";
import {
  classifyComputerUseIntentSync,
  resolveAmbiguousComputerUseRoute,
} from "../shared/aletheiaComputerUseClassifier.ts";
import { classifyAmbiguousComputerUseWithHaiku } from "./aletheiaComputerUseClassifierHaiku.ts";

export type ResolvedComputerUseClassification = ComputerUseClassification & {
  route: ComputerUseRoute;
};

export async function classifyComputerUseIntent(
  config: GlassConfig,
  request: string,
  activeApp?: string,
  options?: ClassifyComputerUseOptions,
  signal?: AbortSignal,
): Promise<ResolvedComputerUseClassification | { route: "NONE"; goal: string }> {
  const sync = classifyComputerUseIntentSync(request, activeApp, options);
  if (sync.route === "NONE") {
    return { route: "NONE", goal: sync.goal };
  }
  if (sync.route !== "AMBIGUOUS") {
    return sync as ResolvedComputerUseClassification;
  }

  const haiku = await classifyAmbiguousComputerUseWithHaiku(
    config,
    sync.goal,
    sync.targetApp ?? "frontmost app",
    signal,
  );
  return resolveAmbiguousComputerUseRoute(haiku, sync);
}
