/**
 * Glass Guide — Haiku vision pass 1: region mapping + L1.
 */

import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";
import { captureForTextOverlay } from "./textOverlayCapture.ts";
import {
  enrichOrientationRegion,
  parseOrientationRegionsJson,
  type DisplayBounds,
  type OrientationRegion,
} from "../shared/liveOrientationTypes.ts";
import { getCursorDisplayBounds, refreshOrientationAnchorPoint } from "./liveOrientationDisplay.ts";
import { buildE2eOrientationRegions } from "./liveOrientationE2eStubs.ts";
import type { GlassUserSettings } from "../shared/glassSettings.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAP_TIMEOUT_MS = 20_000;

function resolveAnthropicKey(): string | null {
  const keys = listApiKeys();
  for (const meta of keys) {
    if (meta.service.toLowerCase().includes("anthropic")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ?? null;
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) return { mediaType: "image/png", base64: dataUrl };
  return { mediaType: match[1], base64: match[2] };
}

function buildRegionMappingPrompt(input: {
  appName: string;
  userRole: string | null;
  userGoal: string | null;
  knownRegions: string[];
  partialReorient?: boolean;
  forceIncludeRegions?: string[];
}): string {
  const skipList = input.knownRegions.length > 0
    ? input.knownRegions.join(", ")
    : "none";
  const resurfaceList = input.forceIncludeRegions?.length
    ? input.forceIncludeRegions.join(", ")
    : null;
  const reorientNote = input.partialReorient
    ? "The app was updated — only return regions that are new or materially changed."
    : "";
  const resurfaceNote = resurfaceList
    ? `Always include these regions if visible (user has not explored them yet): ${resurfaceList}.`
    : "";
  return `You are looking at ${input.appName}. The user's role is ${input.userRole ?? "unknown"}. They came here to: ${input.userGoal ?? "explore the app"}.

Identify the 4-6 most important UI regions visible right now that this user needs to understand. For each region return: id (slug), label (short name), bounds (x/y/width/height as 0-1 fraction of screen), priority (1=most important first), role (navigation|action|content|settings|status), and l1 (one sentence plain-language explanation written for this user's role and goal).

Skip regions the user clearly already knows: ${skipList}.
${resurfaceNote}
${reorientNote}

Respond as JSON array only — no markdown.`;
}

export type OrientationMapResult = {
  regions: OrientationRegion[];
  imageDataUrl: string | null;
  displayBounds: DisplayBounds;
};

export async function mapOrientationRegions(input: {
  appName: string;
  userRole: string | null;
  userGoal: string | null;
  knownRegions: string[];
  partialReorient?: boolean;
  forceIncludeRegions?: string[];
  settings: GlassUserSettings;
}): Promise<OrientationMapResult> {
  if (process.env.IIVO_GLASS_E2E === "1") {
    return {
      regions: buildE2eOrientationRegions(input.appName),
      imageDataUrl: null,
      displayBounds: getCursorDisplayBounds(),
    };
  }

  const anchor = await refreshOrientationAnchorPoint();
  const capture = await captureForTextOverlay({
    displayTarget: input.settings.displayTarget,
    mode: "full",
    cursorX: anchor.x,
    cursorY: anchor.y,
    hideGlassChrome: false,
  });
  if (!capture) {
    return { regions: [], imageDataUrl: null, displayBounds: getCursorDisplayBounds() };
  }

  const apiKey = resolveAnthropicKey();
  if (!apiKey) {
    return { regions: [], imageDataUrl: capture.imageDataUrl, displayBounds: capture.displayBounds };
  }

  const { mediaType, base64 } = parseDataUrl(capture.imageDataUrl);
  const skipList = input.knownRegions.filter(
    (id) => !input.forceIncludeRegions?.includes(id),
  );
  const prompt = buildRegionMappingPrompt({
    appName: input.appName,
    userRole: input.userRole,
    userGoal: input.userGoal,
    knownRegions: skipList,
    partialReorient: input.partialReorient,
    forceIncludeRegions: input.forceIncludeRegions,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAP_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { regions: [], imageDataUrl: capture.imageDataUrl, displayBounds: capture.displayBounds };
    }
    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text) {
      return { regions: [], imageDataUrl: capture.imageDataUrl, displayBounds: capture.displayBounds };
    }

    let parsed: unknown;
    try {
      const jsonMatch = /\[[\s\S]*\]/.exec(text);
      parsed = JSON.parse(jsonMatch?.[0] ?? text);
    } catch {
      return { regions: [], imageDataUrl: capture.imageDataUrl, displayBounds: capture.displayBounds };
    }
    return {
      regions: parseOrientationRegionsJson(parsed),
      imageDataUrl: capture.imageDataUrl,
      displayBounds: capture.displayBounds,
    };
  } catch {
    return { regions: [], imageDataUrl: capture.imageDataUrl, displayBounds: capture.displayBounds };
  } finally {
    clearTimeout(timer);
  }
}

/** Re-map a single region for stuck detection mini-session. */
export async function remapSingleOrientationRegion(
  regionId: string,
  input: Parameters<typeof mapOrientationRegions>[0],
): Promise<OrientationRegion | null> {
  const mapped = await mapOrientationRegions(input);
  return mapped.regions.find((r) => r.id === regionId) ?? mapped.regions[0] ?? null;
}

export function mergeKnownRegionLabels(
  regions: OrientationRegion[],
  knownIds: string[],
): OrientationRegion[] {
  return regions.filter((r) => !knownIds.includes(r.id) || r.l3);
}

export { enrichOrientationRegion };
