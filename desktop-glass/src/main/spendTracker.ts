/**
 * AI Spend Tracker — fetches billing/usage data from each provider's REST API
 * using keys stored in the API Key Manager (safeStorage).
 *
 * Providers with live billing APIs:
 *   openai      — /v1/dashboard/billing/usage  (today + month, USD cents → USD)
 *   elevenlabs  — /v1/user                     (character counts + overage USD)
 *   deepgram    — /v1/projects + /balances      (remaining prepaid credit USD)
 *
 * Providers with no public billing API (shown as "unavailable" when key stored):
 *   anthropic, gemini, perplexity, groq, mistral, xai, cohere, together,
 *   replicate, stability, huggingface, fireworks, anyscale, bedrock, vertex
 *
 * Auto-discovery: any stored key whose service name matches a known AI provider
 * gets a row showing it's configured, even if we can't pull spend data.
 *
 * Results are cached for CACHE_TTL_MS; spendRefresh bypasses the cache.
 */

import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";
import type { ProviderSpendResult, SpendSnapshot } from "../shared/ipc.ts";
import { logSpendSnapshot } from "./spendHistory.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const FETCH_TIMEOUT_MS = 12_000;

// ---------------------------------------------------------------------------
// Known providers with no public billing API
// Maps service name keywords → display names
// ---------------------------------------------------------------------------

const UNAVAILABLE_PROVIDERS: { keywords: string[]; service: string; displayName: string }[] = [
  { keywords: ["anthropic", "claude"],    service: "anthropic",   displayName: "Anthropic" },
  { keywords: ["gemini", "google", "bard", "vertex", "palm"], service: "gemini", displayName: "Google Gemini" },
  { keywords: ["perplexity"],             service: "perplexity",  displayName: "Perplexity" },
  { keywords: ["groq"],                   service: "groq",        displayName: "Groq" },
  { keywords: ["mistral"],                service: "mistral",     displayName: "Mistral" },
  { keywords: ["xai", "grok", "x.ai"],   service: "xai",         displayName: "xAI (Grok)" },
  { keywords: ["cohere"],                 service: "cohere",      displayName: "Cohere" },
  { keywords: ["together"],               service: "together",    displayName: "Together AI" },
  { keywords: ["replicate"],              service: "replicate",   displayName: "Replicate" },
  { keywords: ["stability", "stable"],    service: "stability",   displayName: "Stability AI" },
  { keywords: ["huggingface", "hf"],      service: "huggingface", displayName: "Hugging Face" },
  { keywords: ["fireworks"],              service: "fireworks",   displayName: "Fireworks AI" },
  { keywords: ["bedrock"],                service: "bedrock",     displayName: "AWS Bedrock" },
  { keywords: ["midjourney"],             service: "midjourney",  displayName: "Midjourney" },
  { keywords: ["cursor"],                 service: "cursor",      displayName: "Cursor" },
  { keywords: ["deepl"],                  service: "deepl",       displayName: "DeepL" },
];

// Service IDs handled by live adapters — excluded from auto-discovery loop
const LIVE_ADAPTER_SERVICES = new Set(["openai", "elevenlabs", "deepgram"]);

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedSnapshot: SpendSnapshot | null = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Helper: timed fetch
// ---------------------------------------------------------------------------

async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Helper: find a stored key by service substring (case-insensitive)
// ---------------------------------------------------------------------------

function findKeyBySubstring(serviceSubstring: string): { id: string; service: string; label: string } | null {
  const keys = listApiKeys();
  const lower = serviceSubstring.toLowerCase();
  return keys.find((k) => k.service.toLowerCase().includes(lower)) ?? null;
}

function getKeyValue(id: string): string | null {
  return getApiKeyValue(id);
}

// ---------------------------------------------------------------------------
// Provider: OpenAI
// ---------------------------------------------------------------------------

async function fetchOpenAI(): Promise<ProviderSpendResult> {
  const now = Date.now();
  const base = { service: "openai", displayName: "OpenAI", lastFetched: now } as const;

  const meta = findKeyBySubstring("openai");
  if (!meta) return { ...base, status: "no-key" };
  const apiKey = getKeyValue(meta.id);
  if (!apiKey) return { ...base, status: "no-key" };

  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const monthStart = todayStr.slice(0, 8) + "01";
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    const [todayRes, monthRes] = await Promise.all([
      timedFetch(`https://api.openai.com/v1/dashboard/billing/usage?start_date=${todayStr}&end_date=${tomorrowStr}`, { headers }),
      timedFetch(`https://api.openai.com/v1/dashboard/billing/usage?start_date=${monthStart}&end_date=${tomorrowStr}`, { headers }),
    ]);

    if (!todayRes.ok || !monthRes.ok) {
      const failed = todayRes.ok ? monthRes : todayRes;
      const errText = await failed.text().catch(() => "");
      return { ...base, status: "error", error: `HTTP ${failed.status}: ${errText.slice(0, 120)}` };
    }

    const [todayData, monthData] = await Promise.all([
      todayRes.json() as Promise<{ total_usage?: number }>,
      monthRes.json() as Promise<{ total_usage?: number }>,
    ]);

    return {
      ...base,
      status: "ok",
      todayUSD: typeof todayData.total_usage === "number" ? todayData.total_usage / 100 : undefined,
      monthUSD: typeof monthData.total_usage === "number" ? monthData.total_usage / 100 : undefined,
    };
  } catch (err) {
    return { ...base, status: "error", error: err instanceof Error ? err.message : "Fetch failed" };
  }
}

// ---------------------------------------------------------------------------
// Provider: ElevenLabs
// ---------------------------------------------------------------------------

async function fetchElevenLabs(): Promise<ProviderSpendResult> {
  const now = Date.now();
  const base = { service: "elevenlabs", displayName: "ElevenLabs", lastFetched: now } as const;

  const meta = findKeyBySubstring("elevenlabs");
  if (!meta) return { ...base, status: "no-key" };
  const apiKey = getKeyValue(meta.id);
  if (!apiKey) return { ...base, status: "no-key" };

  try {
    const res = await timedFetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": apiKey },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ...base, status: "error", error: `HTTP ${res.status}: ${errText.slice(0, 120)}` };
    }

    const data = await res.json() as {
      subscription?: {
        character_count?: number;
        character_limit?: number;
        next_character_count_reset_unix?: number;
        current_overage?: { amount?: string };
      };
    };

    const sub = data.subscription ?? {};
    const overageStr = sub.current_overage?.amount;
    const monthUSD = overageStr ? parseFloat(overageStr) : 0;

    return {
      ...base,
      status: "ok",
      monthUSD: isNaN(monthUSD) ? undefined : monthUSD,
      unitLabel: "characters",
      unitsUsed: typeof sub.character_count === "number" ? sub.character_count : undefined,
      unitLimit: typeof sub.character_limit === "number" ? sub.character_limit : undefined,
      unitReset: typeof sub.next_character_count_reset_unix === "number"
        ? sub.next_character_count_reset_unix * 1000
        : undefined,
    };
  } catch (err) {
    return { ...base, status: "error", error: err instanceof Error ? err.message : "Fetch failed" };
  }
}

// ---------------------------------------------------------------------------
// Provider: Deepgram
// ---------------------------------------------------------------------------

async function fetchDeepgram(): Promise<ProviderSpendResult> {
  const now = Date.now();
  const base = { service: "deepgram", displayName: "Deepgram", lastFetched: now } as const;

  const meta = findKeyBySubstring("deepgram");
  if (!meta) return { ...base, status: "no-key" };
  const apiKey = getKeyValue(meta.id);
  if (!apiKey) return { ...base, status: "no-key" };

  try {
    const headers = { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" };

    const projectsRes = await timedFetch("https://api.deepgram.com/v1/projects", { headers });
    if (!projectsRes.ok) {
      const errText = await projectsRes.text().catch(() => "");
      return { ...base, status: "error", error: `HTTP ${projectsRes.status}: ${errText.slice(0, 120)}` };
    }

    const projectsData = await projectsRes.json() as { projects?: { project_id: string }[] };
    const projectId = projectsData.projects?.[0]?.project_id;
    if (!projectId) {
      return { ...base, status: "error", error: "No Deepgram project found for this key" };
    }

    const balancesRes = await timedFetch(
      `https://api.deepgram.com/v1/projects/${projectId}/balances`,
      { headers },
    );

    if (!balancesRes.ok) {
      const errText = await balancesRes.text().catch(() => "");
      return { ...base, status: "error", error: `HTTP ${balancesRes.status}: ${errText.slice(0, 120)}` };
    }

    const balancesData = await balancesRes.json() as {
      balances?: { amount?: number; units?: string }[];
    };

    let balanceUSD = 0;
    for (const b of balancesData.balances ?? []) {
      if (b.units?.toUpperCase() === "USD" && typeof b.amount === "number") {
        balanceUSD += b.amount;
      }
    }

    return { ...base, status: "ok", balanceUSD };
  } catch (err) {
    return { ...base, status: "error", error: err instanceof Error ? err.message : "Fetch failed" };
  }
}

// ---------------------------------------------------------------------------
// Auto-discover: scan all stored keys for known providers without billing APIs
// Returns a row for each match, only if the user has that key stored.
// Skips providers already handled by a live adapter.
// ---------------------------------------------------------------------------

function discoverUnavailableProviders(): ProviderSpendResult[] {
  const storedKeys = listApiKeys();
  const now = Date.now();
  const seen = new Set<string>();
  const results: ProviderSpendResult[] = [];

  for (const key of storedKeys) {
    const serviceLabel = key.service.toLowerCase();

    // Skip if it matches a live-adapter provider
    if (
      serviceLabel.includes("openai") ||
      serviceLabel.includes("elevenlabs") ||
      serviceLabel.includes("deepgram")
    ) continue;

    // Try to match against known providers (for canonical name + display name)
    let matched: (typeof UNAVAILABLE_PROVIDERS)[0] | undefined;
    for (const p of UNAVAILABLE_PROVIDERS) {
      if (p.keywords.some((kw) => serviceLabel.includes(kw))) {
        matched = p;
        break;
      }
    }

    if (matched) {
      // Known provider — deduplicate by canonical service id
      if (!seen.has(matched.service)) {
        seen.add(matched.service);
        results.push({
          service: matched.service,
          displayName: matched.displayName,
          status: "unavailable",
          error: "No public billing API",
          lastFetched: now,
        });
      }
    } else {
      // Unknown provider — show it anyway using whatever name the user stored
      // Deduplicate by key id so multiple keys for the same custom service don't double-up
      const dedupKey = `custom:${key.id}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        // Use label if set, fall back to service name, capitalize first letter
        const rawName = (key.label || key.service || "Unknown").trim();
        const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
        results.push({
          service: key.service || key.id,
          displayName,
          status: "unavailable",
          error: "No billing API — add it via API Keys tab",
          lastFetched: now,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Assemble snapshot
// ---------------------------------------------------------------------------

async function buildSnapshot(): Promise<SpendSnapshot> {
  const [openai, elevenlabs, deepgram] = await Promise.all([
    fetchOpenAI(),
    fetchElevenLabs(),
    fetchDeepgram(),
  ]);

  const liveResults = [openai, elevenlabs, deepgram];
  const unavailableResults = discoverUnavailableProviders();

  // Sort unavailable: known providers first in declaration order, then any extras
  const allResults = [...liveResults, ...unavailableResults];

  // Filter out "no-key" rows for providers not worth showing (live adapters only)
  // Unavailable discovered providers are only shown when key IS stored, so always show them.
  const providers = allResults.filter((r) => {
    // For live adapters with no-key, hide them from the panel (they're covered by the hint)
    if (r.status === "no-key" && LIVE_ADAPTER_SERVICES.has(r.service)) return true;
    return true; // show everything
  });

  let totalTodayUSD = 0;
  let totalMonthUSD = 0;
  for (const r of providers) {
    if (r.todayUSD != null) totalTodayUSD += r.todayUSD;
    if (r.monthUSD != null) totalMonthUSD += r.monthUSD;
  }

  return { providers, totalTodayUSD, totalMonthUSD, refreshedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the cached snapshot. If no cache or stale, fetches now. */
export async function getSpendSnapshot(): Promise<SpendSnapshot> {
  if (cachedSnapshot && Date.now() - cachedSnapshot.refreshedAt < CACHE_TTL_MS) {
    return cachedSnapshot;
  }
  cachedSnapshot = await buildSnapshot();
  logSpendSnapshot(cachedSnapshot);
  return cachedSnapshot;
}

/** Force-refreshes all providers and returns the new snapshot. */
export async function refreshSpendSnapshot(): Promise<SpendSnapshot> {
  cachedSnapshot = await buildSnapshot();
  logSpendSnapshot(cachedSnapshot);
  return cachedSnapshot;
}

/** Start a 15-minute background poll. Call once on app ready. */
export function startSpendPolling(): void {
  if (pollingTimer) return;
  setTimeout(() => {
    buildSnapshot().then((s) => {
      cachedSnapshot = s;
      logSpendSnapshot(s);
    }).catch(() => {});
  }, 10_000);
  pollingTimer = setInterval(() => {
    buildSnapshot().then((s) => {
      cachedSnapshot = s;
      logSpendSnapshot(s);
    }).catch(() => {});
  }, CACHE_TTL_MS);
}

/** Stop background polling (for app shutdown). */
export function stopSpendPolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}
