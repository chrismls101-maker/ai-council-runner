/**
 * Main-process IIVO server degraded state — drives panel indicator + setup rows.
 */

import type { IivoServerDegradedSource } from "../shared/iivoServerDegraded.ts";
import { defaultIivoServerDegradedDetail } from "../shared/iivoServerDegraded.ts";

const SOURCE_DISPLAY_PRIORITY: IivoServerDegradedSource[] = [
  "translate",
  "stt",
  "memory",
  "setup",
  "health",
];

const degradedBySource = new Map<IivoServerDegradedSource, string>();
let degradedReason: string | undefined;
let degradedSource: IivoServerDegradedSource | undefined;
let onChange: (() => void) | null = null;

function syncAggregateReason(): void {
  for (const source of SOURCE_DISPLAY_PRIORITY) {
    const reason = degradedBySource.get(source);
    if (reason) {
      degradedReason = reason;
      degradedSource = source;
      return;
    }
  }
  degradedReason = undefined;
  degradedSource = undefined;
}

export function registerIivoServerDegradedHandler(handler: () => void): void {
  onChange = handler;
}

export function markIivoServerDegraded(
  source: IivoServerDegradedSource,
  reason?: string,
): void {
  const next = reason?.trim() || defaultIivoServerDegradedDetail(source);
  if (degradedBySource.get(source) === next) return;
  degradedBySource.set(source, next);
  syncAggregateReason();
  onChange?.();
}

export function clearIivoServerDegradedSource(source: IivoServerDegradedSource): void {
  if (!degradedBySource.delete(source)) return;
  syncAggregateReason();
  onChange?.();
}

export function clearIivoServerDegradedSources(sources: IivoServerDegradedSource[]): void {
  let changed = false;
  for (const source of sources) {
    if (degradedBySource.delete(source)) changed = true;
  }
  if (!changed) return;
  syncAggregateReason();
  onChange?.();
}

/** Clear every degraded source (tests / full reset). */
export function clearIivoServerDegraded(): void {
  if (degradedBySource.size === 0) return;
  degradedBySource.clear();
  syncAggregateReason();
  onChange?.();
}

export function getIivoServerDegradedReason(): string | undefined {
  return degradedReason;
}

export function getIivoServerDegradedSource(): IivoServerDegradedSource | undefined {
  return degradedSource;
}

export function isIivoServerDegradedForSource(source: IivoServerDegradedSource): boolean {
  return degradedBySource.has(source);
}
