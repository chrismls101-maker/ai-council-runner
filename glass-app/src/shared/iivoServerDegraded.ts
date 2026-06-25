/**
 * Track IIVO server reachability for panel degraded-mode UI.
 * Shared helpers — main process owns mutable state via iivoServerDegradedMain.ts.
 */

export type IivoServerDegradedSource =
  | "health"
  | "translate"
  | "stt"
  | "memory"
  | "setup";

const SERVER_UNREACHABLE_RE =
  /server unavailable|translation server unavailable|memory save failed|could not reach|unreachable|econnrefused|enotfound|fetch failed|network failure|failed to fetch|503|502|504/i;

export function isIivoServerUnreachableMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return SERVER_UNREACHABLE_RE.test(trimmed);
}

export function isIivoServerUnreachableError(err: unknown): boolean {
  if (err instanceof Error) return isIivoServerUnreachableMessage(err.message);
  return isIivoServerUnreachableMessage(String(err));
}

export function defaultIivoServerDegradedDetail(source?: IivoServerDegradedSource): string {
  const feature =
    source === "translate"
      ? "Live Translate"
      : source === "stt"
        ? "server speech-to-text"
        : source === "memory"
          ? "Memory Vault saves"
          : "server-dependent features";
  return `IIVO server offline — ${feature} and related cloud features are unavailable.`;
}
