/**
 * IIVO Glass configuration + URL builders.
 *
 * Glass never invents a new backend. It talks to the existing IIVO server and
 * hands off to the existing IIVO web app exactly like IIVO Lens does.
 */

import {
  DEFAULT_GLASS_LAYOUT_PRESET,
  parseLayoutPreset,
  type GlassLayoutPreset,
} from "./glassLayoutTypes.ts";
import {
  DEFAULT_OVERLAY_MODE,
  parseOverlayMode,
  type GlassWindowState,
  type OverlayMode,
} from "./glassWindowTypes.ts";

export type { GlassLayoutPreset, GlassWindowState, OverlayMode };

export interface GlassConfig {
  /** IIVO web app base, e.g. http://localhost:5173 */
  iivoWebUrl: string;
  /** IIVO API server base, e.g. http://localhost:3001 */
  iivoApiUrl: string;
  /** Full-screen intelligence overlay (click-through); on by default */
  overlayEnabled: boolean;
  /** Overlay visual mode: passive | insights | hidden */
  overlayMode: OverlayMode;
  /** Window layout preset (computed from current display metrics) */
  layoutPreset: GlassLayoutPreset;
}

export const DEFAULT_CONFIG: GlassConfig = {
  iivoWebUrl: "http://localhost:5173",
  iivoApiUrl: "http://localhost:3001",
  overlayEnabled: true,
  overlayMode: DEFAULT_OVERLAY_MODE,
  layoutPreset: DEFAULT_GLASS_LAYOUT_PRESET,
};

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return defaultValue;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Resolve config from env (IIVO_WEB_URL / IIVO_API_URL) with optional overrides. */
export function resolveConfig(
  env: Record<string, string | undefined> = {},
  overrides: Partial<GlassConfig> = {},
): GlassConfig {
  const webRaw = overrides.iivoWebUrl ?? env.IIVO_WEB_URL ?? DEFAULT_CONFIG.iivoWebUrl;
  const apiRaw = overrides.iivoApiUrl ?? env.IIVO_API_URL ?? DEFAULT_CONFIG.iivoApiUrl;
  return {
    iivoWebUrl: stripTrailingSlash(webRaw.trim() || DEFAULT_CONFIG.iivoWebUrl),
    iivoApiUrl: stripTrailingSlash(apiRaw.trim() || DEFAULT_CONFIG.iivoApiUrl),
    overlayEnabled: parseBool(env.IIVO_GLASS_OVERLAY_ENABLED, DEFAULT_CONFIG.overlayEnabled),
    overlayMode: parseOverlayMode(env.IIVO_GLASS_OVERLAY_MODE ?? overrides.overlayMode),
    layoutPreset: overrides.layoutPreset ?? parseLayoutPreset(env.IIVO_GLASS_LAYOUT_PRESET),
  };
}

export function buildContextApiUrl(config: GlassConfig): string {
  return `${config.iivoApiUrl}/api/context`;
}

export function buildScreenshotApiUrl(config: GlassConfig, contextId: string): string {
  return `${config.iivoApiUrl}/api/context/${encodeURIComponent(contextId)}/screenshot`;
}

/** Handoff that attaches context AND pre-fills the composer (mirrors Lens "Ask IIVO"). */
export function buildLensAskUrl(config: GlassConfig, contextId: string): string {
  return `${config.iivoWebUrl}/?lensAsk=${encodeURIComponent(contextId)}`;
}

/** Handoff that only attaches the context chip (mirrors Lens "Attach"). */
export function buildLensContextUrl(config: GlassConfig, contextId: string): string {
  return `${config.iivoWebUrl}/?lensContextId=${encodeURIComponent(contextId)}`;
}

export function buildIivoChatUrl(config: GlassConfig): string {
  return `${config.iivoWebUrl}/`;
}
