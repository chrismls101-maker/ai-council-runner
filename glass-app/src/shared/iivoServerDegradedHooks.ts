import type { IivoServerDegradedSource } from "./iivoServerDegraded.ts";

export type IivoServerDegradedReporter = (
  source: IivoServerDegradedSource,
  reason: string,
) => void;

let reporter: IivoServerDegradedReporter | null = null;

export function registerIivoServerDegradedReporter(fn: IivoServerDegradedReporter): void {
  reporter = fn;
}

export function reportIivoServerDegraded(
  source: IivoServerDegradedSource,
  reason: string,
): void {
  reporter?.(source, reason);
}

let recoverReporter: ((source: IivoServerDegradedSource) => void) | null = null;

export function registerIivoServerRecoveredReporter(
  fn: (source: IivoServerDegradedSource) => void,
): void {
  recoverReporter = fn;
}

export function reportIivoServerRecovered(source: IivoServerDegradedSource): void {
  recoverReporter?.(source);
}
