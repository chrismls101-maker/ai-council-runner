/**
 * E2E-only hooks (enabled when IIVO_GLASS_E2E=1). Mocks external browser opens.
 */

import { shell } from "electron";

const externalUrls: string[] = [];
let installed = false;

export function installGlassE2eHooks(): void {
  if (process.env.IIVO_GLASS_E2E !== "1" || installed) return;
  installed = true;

  shell.openExternal = async (url: string) => {
    externalUrls.push(url);
  };
}

export function getE2eExternalUrls(): string[] {
  return [...externalUrls];
}

export function resetE2eExternalUrls(): void {
  externalUrls.length = 0;
}
