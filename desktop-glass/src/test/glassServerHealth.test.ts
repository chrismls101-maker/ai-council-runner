/**
 * Infra note (not @legacy): imports main-process modules that transitively require `electron`.
 * The suite fails to load under plain `node:test` (SyntaxError on desktopCapturer).
 * Omitted from `npm test` in package.json — run via Electron context or refactor imports before CI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fetchGlassServerHealth } from "../main/glassVisualAskPreflight.ts";
import { enrichGlassServerHealthSnapshot } from "../main/glassVisualAskPreflight.ts";
import { buildGlassSetupCapabilities } from "../shared/glassCapabilities.ts";
import { iivoApiAuthHeaders } from "../shared/iivoApiAuth.ts";
import { resolveConfig } from "../shared/config.ts";

function loadRootEnv(): Record<string, string> {
  const envPath = path.resolve(import.meta.dirname, "../../../.env");
  const env: Record<string, string> = {};
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    /* optional for CI */
  }
  return env;
}

test("iivoApiAuthHeaders sends bearer when secret configured", () => {
  const headers = iivoApiAuthHeaders({ IIVO_GLASS_API_SECRET: "test-secret" });
  assert.equal(headers.Authorization, "Bearer test-secret");
});

test("iivoApiAuthHeaders omits auth when secret unset", () => {
  assert.deepEqual(iivoApiAuthHeaders({}), {});
});

test("minimal /api/health payload is enriched with vision and stt", async (t) => {
  const env: Record<string, string | undefined> = {
    ...loadRootEnv(),
    IIVO_API_URL: "http://127.0.0.1:3001",
  };
  if (!env.IIVO_GLASS_API_SECRET?.trim()) {
    t.skip("IIVO_GLASS_API_SECRET not configured in root .env");
    return;
  }

  const config = resolveConfig(env);
  const enriched = await enrichGlassServerHealthSnapshot(config, {
    ok: true,
    missingKeys: [],
  });
  if (!enriched.vision) {
    t.skip("Local IIVO server not reachable for vision config");
    return;
  }

  assert.equal(enriched.vision.enabled, true);
  assert.equal(enriched.vision.configured, true);
  assert.equal(enriched.stt?.configured, true);
});

test("live health probe yields green server vision stt cards when server is up", async (t) => {
  const env: Record<string, string | undefined> = {
    ...loadRootEnv(),
    IIVO_API_URL: "http://127.0.0.1:3001",
  };
  if (!env.IIVO_GLASS_API_SECRET?.trim()) {
    t.skip("IIVO_GLASS_API_SECRET not configured in root .env");
    return;
  }

  const config = resolveConfig(env);
  const result = await fetchGlassServerHealth(config);
  if (!result.snapshot) {
    t.skip(`Local IIVO server not reachable: ${result.error ?? "unknown"}`);
    return;
  }

  assert.equal(result.snapshot.vision?.enabled, true);
  assert.equal(result.snapshot.vision?.configured, true);
  assert.equal(result.snapshot.stt?.configured, true);

  const rows = buildGlassSetupCapabilities({
    screenCaptureProbe: "unknown",
    micPermission: "not_requested",
    systemAudioStatus: "not_tested",
    serverHealth: {
      reachable: true,
      vision: result.snapshot.vision,
      stt: result.snapshot.stt
        ? {
            configured: result.snapshot.stt.configured,
            enabled: result.snapshot.stt.enabled ?? result.snapshot.stt.configured,
            reason: result.snapshot.stt.reason,
          }
        : undefined,
    },
    sttStatus: "configured",
    sttEnabled: true,
  });

  for (const id of ["server", "vision", "stt"] as const) {
    const row = rows.find((r) => r.id === id);
    assert.equal(row?.severity, "ok", `${id} should be green when health is ok`);
  }
});
