/**
 * IIVO Glass configuration + URL builders.
 *
 * Glass never invents a new backend. It talks to the existing IIVO server and
 * hands off to the existing IIVO web app exactly like IIVO Lens does.
 */

export interface GlassConfig {
  /** IIVO web app base, e.g. http://localhost:5173 */
  iivoWebUrl: string;
  /** IIVO API server base, e.g. http://localhost:3001 */
  iivoApiUrl: string;
}

export const DEFAULT_CONFIG: GlassConfig = {
  iivoWebUrl: "http://localhost:5173",
  iivoApiUrl: "http://localhost:3001",
};

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
