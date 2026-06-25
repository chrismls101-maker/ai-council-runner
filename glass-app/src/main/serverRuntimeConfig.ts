import type { GlassConfig } from "../shared/config.ts";
import { iivoApiAuthHeaders } from "../shared/iivoApiAuth.ts";

import type { ServerRuntimeFlags } from "../shared/serverRuntimeFlags.ts";

export async function fetchServerRuntimeFlags(
  config: GlassConfig,
): Promise<ServerRuntimeFlags | null> {
  try {
    const res = await fetch(`${config.iivoApiUrl.replace(/\/$/, "")}/api/glass/runtime-config`, {
      headers: iivoApiAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<ServerRuntimeFlags> & { ok?: boolean };
    return {
      overlayDemoEnabled: data.overlayDemoEnabled !== false,
      terminalAutoFixEnabled: data.terminalAutoFixEnabled !== false,
      coderBuildLoopEnabledForNewUsers: data.coderBuildLoopEnabledForNewUsers !== false,
      aiCallsEnabled: data.aiCallsEnabled !== false,
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
