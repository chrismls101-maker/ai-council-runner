/**
 * E2E-only hooks (enabled when IIVO_GLASS_E2E=1).
 * Records handoff URLs; uses real shell.openExternal when IIVO_GLASS_E2E_REAL_HANDOFF=1.
 */

import { setGlassHandoffOpenImpl } from "../shared/glassHandoffOpen.ts";

const externalUrls: string[] = [];
let installed = false;

export function installGlassE2eHooks(): void {
  if (process.env.IIVO_GLASS_E2E !== "1" || installed) return;
  installed = true;

  if (process.env.IIVO_GLASS_E2E_REAL_HANDOFF === "1") {
    return;
  }

  setGlassHandoffOpenImpl(async (url) => {
    externalUrls.push(url);
    return { ok: true, url };
  });
}

export function getE2eExternalUrls(): string[] {
  return [...externalUrls];
}

export function resetE2eExternalUrls(): void {
  externalUrls.length = 0;
}
