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
