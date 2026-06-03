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

test("defaults to localhost web + api", () => {
  const config = resolveConfig({});
  assert.equal(config.iivoWebUrl, "http://localhost:5173");
  assert.equal(config.iivoApiUrl, "http://localhost:3001");
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
  assert.equal(buildContextApiUrl(config), "http://localhost:3001/api/context");
  assert.equal(
    buildScreenshotApiUrl(config, "abc 123"),
    "http://localhost:3001/api/context/abc%20123/screenshot",
  );
  assert.equal(buildLensAskUrl(config, "ctx1"), "http://localhost:5173/?lensAsk=ctx1");
  assert.equal(
    buildLensContextUrl(config, "ctx1"),
    "http://localhost:5173/?lensContextId=ctx1",
  );
  assert.equal(buildIivoChatUrl(config), "http://localhost:5173/");
});
