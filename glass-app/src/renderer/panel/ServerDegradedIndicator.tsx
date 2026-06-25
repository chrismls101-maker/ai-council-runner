import type { JSX } from "react";
import type { GlassState } from "../../shared/ipc.ts";

/** Small gray pill when the IIVO server is offline — server-dependent features are degraded. */
export function ServerDegradedIndicator({ state }: { state: GlassState }): JSX.Element | null {
  const runtimeReason = state.iivoServerDegradedReason?.trim();
  const server = state.setupCapabilities?.find((row) => row.id === "server");
  const setupOffline = server?.severity === "error";
  if (!runtimeReason && !setupOffline) return null;

  const detail =
    runtimeReason ??
    server?.detail ??
    "IIVO server offline — live translate, server STT, memory vault, and AI notes are unavailable.";

  return (
    <span
      className="panel__server-degraded"
      data-testid="glass-server-degraded-indicator"
      title={detail}
      aria-label={detail}
    >
      Server offline
    </span>
  );
}
