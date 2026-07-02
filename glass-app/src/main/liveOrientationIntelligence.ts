/**
 * Glass Guide — L2 workflow guidance + L3 Sonnet personalization.
 */

import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";
import { buildUserProfile } from "./glassMemoryEngine.ts";
import {
  applyL3Adaptations,
  parseOrientationL2Json,
  parseOrientationL3Json,
  applyGoalRegionSelection,
  parseOrientationGoalSelectionJson,
  type AppProficiencyProfile,
  type OrientationRegion,
} from "../shared/liveOrientationTypes.ts";
import { buildE2eOrientationL2 } from "./liveOrientationE2eStubs.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-20250514";
const L2_TIMEOUT_MS = 12_000;
const L3_TIMEOUT_MS = 15_000;

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

export async function runOrientationL2Guidance(input: {
  imageDataUrl: string;
  appName: string;
  userRole: string | null;
  userGoal: string | null;
}): Promise<{ found: boolean; guidance: string | null }> {
  if (process.env.IIVO_GLASS_E2E === "1") {
    return buildE2eOrientationL2();
  }

  const apiKey = resolveAnthropicKey();
  if (!apiKey) return { found: false, guidance: null };

  const { mediaType, base64 } = parseDataUrl(input.imageDataUrl);
  const prompt = `You are looking at ${input.appName}. The user is ${input.userRole ?? "unknown"}. They came here to: ${input.userGoal ?? "explore the app"}.

Based on what you can see — the current screen, the active panel, any visible state — is the user about to do something inefficient, incorrect, or unnecessarily hard? Examples: using a manual process when an automated one exists, filling in a field that belongs to someone else's workflow, using a deprecated feature, about to create a duplicate.

If yes, return JSON: { "found": true, "guidance": "one sentence describing the faster/correct approach" }.
If no, return JSON: { "found": false }.

Respond as JSON only.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), L2_TIMEOUT_MS);

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
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { found: false, guidance: null };
    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text) return { found: false, guidance: null };
    try {
      const jsonMatch = /\{[\s\S]*\}/.exec(text);
      return parseOrientationL2Json(JSON.parse(jsonMatch?.[0] ?? text));
    } catch {
      return { found: false, guidance: null };
    }
  } catch {
    return { found: false, guidance: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function runOrientationL3Personalization(input: {
  regions: OrientationRegion[];
  profile: AppProficiencyProfile | null;
  userRole: string | null;
  userGoal: string | null;
}): Promise<OrientationRegion[]> {
  if (process.env.IIVO_GLASS_E2E === "1" || !input.profile) {
    return input.regions;
  }

  const apiKey = resolveAnthropicKey();
  if (!apiKey) return input.regions;

  let memoryContext = "";
  try {
    const profileText = buildUserProfile();
    if (profileText?.trim()) {
      memoryContext = profileText.trim().slice(0, 500);
    }
  } catch {
    // memory optional
  }

  if (!memoryContext && !input.profile.goalHistory.length) {
    return input.regions;
  }

  const prompt = `The user is a ${input.userRole ?? "unknown role"} with background: ${memoryContext || "limited history"}.
They have used this app ${input.profile.sessionCount} times before. Previously they came here to: ${input.profile.goalHistory.slice(-3).join("; ") || "various tasks"}.
Today they came to: ${input.userGoal ?? "explore"}.

Regions to adapt:
${JSON.stringify(input.regions.map((r) => ({ id: r.id, label: r.label, priority: r.priority, l1: r.l1 })))}

Adapt the orientation: which regions matter most for their role? What can be skipped because they likely know it? What should be explained differently?

Return JSON array: [{ "regionId": string, "priority"?: number, "l3Note"?: string }]
Respond as JSON only.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), L3_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: SONNET_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return input.regions;
    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text) return input.regions;
    try {
      const jsonMatch = /\[[\s\S]*\]/.exec(text);
      const adaptations = parseOrientationL3Json(JSON.parse(jsonMatch?.[0] ?? text));
      return applyL3Adaptations(input.regions, adaptations);
    } catch {
      return input.regions;
    }
  } catch {
    return input.regions;
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichOrientationRegions(input: {
  regions: OrientationRegion[];
  imageDataUrl: string | null;
  appName: string;
  userRole: string | null;
  userGoal: string | null;
  profile: AppProficiencyProfile | null;
}): Promise<{ regions: OrientationRegion[]; l2Guidance: string | null }> {
  const l2Promise = input.imageDataUrl
    ? runOrientationL2Guidance({
        imageDataUrl: input.imageDataUrl,
        appName: input.appName,
        userRole: input.userRole,
        userGoal: input.userGoal,
      })
    : Promise.resolve({ found: false, guidance: null });

  const l3Promise = runOrientationL3Personalization({
    regions: input.regions,
    profile: input.profile,
    userRole: input.userRole,
    userGoal: input.userGoal,
  });

  const [l2, regions] = await Promise.all([l2Promise, l3Promise]);
  return {
    regions,
    l2Guidance: l2.found ? l2.guidance : null,
  };
}

const GOAL_SELECT_TIMEOUT_MS = 10_000;

function matchRegionsForGoalE2e(regions: OrientationRegion[], userGoal: string): OrientationRegion[] {
  const goal = userGoal.toLowerCase();
  const keywords = goal.split(/\s+/).filter((w) => w.length > 3);
  const scored = regions.map((region) => {
    const hay = `${region.label} ${region.l1} ${region.role}`.toLowerCase();
    let score = 0;
    for (const word of keywords) {
      if (hay.includes(word)) score += 2;
    }
    if (/\blog\s*in|sign\s*in|sign\s*up\b/.test(goal) && /\blog|sign|account|auth/i.test(hay)) {
      score += 5;
    }
    return { region, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((entry) => entry.score > 0).map((entry) => entry.region);
  return top.length > 0 ? top.slice(0, 4) : regions.slice(0, 3);
}

export async function selectRegionsForGoal(input: {
  regions: OrientationRegion[];
  appName: string;
  userGoal: string;
}): Promise<OrientationRegion[]> {
  if (process.env.IIVO_GLASS_E2E === "1") {
    return matchRegionsForGoalE2e(input.regions, input.userGoal);
  }

  const apiKey = resolveAnthropicKey();
  if (!apiKey) return input.regions;

  const prompt = `The user is in ${input.appName} and said: "${input.userGoal}".

Mapped UI regions:
${JSON.stringify(input.regions.map((r) => ({ id: r.id, label: r.label, role: r.role, l1: r.l1 })))}

Return an ordered JSON array of regionId strings — only regions that help the user accomplish their goal, most important first. Omit irrelevant chrome. If none match well, return the 2–3 most likely starting points.

Respond as JSON only: ["region-id-1", "region-id-2"]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOAL_SELECT_TIMEOUT_MS);

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
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return input.regions;
    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text) return input.regions;
    const jsonMatch = /\[[\s\S]*\]/.exec(text);
    const selectedIds = parseOrientationGoalSelectionJson(JSON.parse(jsonMatch?.[0] ?? text));
    return applyGoalRegionSelection(input.regions, selectedIds);
  } catch {
    return input.regions;
  } finally {
    clearTimeout(timer);
  }
}
