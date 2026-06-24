/**
 * Default Electron handoff opener (clipboard fallback).
 */

import { clipboard, shell } from "electron";
import {
  openGlassHandoffUrl as openViaRegistry,
  setGlassHandoffOpenImpl,
  type GlassHandoffOpenResult,
} from "../shared/glassHandoffOpen.ts";

export type { GlassHandoffOpenResult } from "../shared/glassHandoffOpen.ts";
export { openGlassHandoffUrl, setGlassHandoffOpenImpl } from "../shared/glassHandoffOpen.ts";

async function defaultOpenHandoffUrl(url: string): Promise<GlassHandoffOpenResult> {
  try {
    await shell.openExternal(url);
    return { ok: true, url };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    let copiedToClipboard = false;
    try {
      clipboard.writeText(url);
      copiedToClipboard = true;
    } catch {
      copiedToClipboard = false;
    }
    return { ok: false, url, error, copiedToClipboard };
  }
}

let defaultInstalled = false;

export function installDefaultGlassHandoffOpener(): void {
  if (defaultInstalled) return;
  defaultInstalled = true;
  setGlassHandoffOpenImpl(defaultOpenHandoffUrl);
}

/** @deprecated use openGlassHandoffUrl from shared registry after installDefaultGlassHandoffOpener */
export async function openGlassHandoffUrlElectron(url: string): Promise<GlassHandoffOpenResult> {
  installDefaultGlassHandoffOpener();
  return openViaRegistry(url);
}
