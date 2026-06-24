import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  resolveConfig,
  buildContextApiUrl,
  buildScreenshotApiUrl,
  buildLensAskUrl,
  buildLensContextUrl,
  buildIivoChatUrl,
} from "../shared/config.ts";

test("defaults to production web + api", () => {
  const config = resolveConfig({});
  assert.equal(config.iivoWebUrl, "https://iivo.ai");
  assert.equal(config.iivoApiUrl, "https://iivo.ai");
  assert.equal(config.overlayEnabled, true);
  assert.equal(config.overlayMode, "passive");
});

test("overlay mode from env", () => {
  const config = resolveConfig({ IIVO_GLASS_OVERLAY_MODE: "insights" });
  assert.equal(config.overlayMode, "insights");
});

test("overlay enabled via env", () => {
  const config = resolveConfig({ IIVO_GLASS_OVERLAY_ENABLED: "true" });
  assert.equal(config.overlayEnabled, true);
});

test("layout preset defaults to compact_dock", () => {
  const config = resolveConfig({});
  assert.equal(config.layoutPreset, "compact_dock");
});

test("layout preset from env", () => {
  const config = resolveConfig({ IIVO_GLASS_LAYOUT_PRESET: "floating_dock" });
  assert.equal(config.layoutPreset, "floating_dock");
});

test("reads env vars and strips trailing slashes", () => {
  const config = resolveConfig({
    IIVO_WEB_URL: "https://app.iivo.test/",
    IIVO_API_URL: "https://api.iivo.test///",
  });
  assert.equal(config.iivoWebUrl, "https://app.iivo.test");
  assert.equal(config.iivoApiUrl, "https://api.iivo.test");
});

test("overrides win over env", () => {
  const config = resolveConfig(
    { IIVO_WEB_URL: "http://env.web" },
    { iivoWebUrl: "http://override.web" },
  );
  assert.equal(config.iivoWebUrl, "http://override.web");
});

test("blank env falls back to defaults", () => {
  const config = resolveConfig({ IIVO_WEB_URL: "   ", IIVO_API_URL: "" });
  assert.deepEqual(config, DEFAULT_CONFIG);
});

test("builds api + handoff urls", () => {
  const config = resolveConfig({});
  assert.equal(buildContextApiUrl(config), "https://iivo.ai/api/context");
  assert.equal(
    buildScreenshotApiUrl(config, "abc 123"),
    "https://iivo.ai/api/context/abc%20123/screenshot",
  );
  assert.equal(buildLensAskUrl(config, "ctx1"), "https://iivo.ai/dashboard?lensAsk=ctx1");
  assert.equal(
    buildLensContextUrl(config, "ctx1"),
    "https://iivo.ai/dashboard?lensContextId=ctx1",
  );
  assert.equal(buildIivoChatUrl(config), "https://iivo.ai/dashboard");
});
