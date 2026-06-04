import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGlassAskUrl } from "../main/glassAskClient.ts";
import { DEFAULT_CONFIG } from "../shared/config.ts";

test("buildGlassAskUrl targets /api/glass/ask", () => {
  assert.equal(buildGlassAskUrl(DEFAULT_CONFIG), "http://localhost:3001/api/glass/ask");
});
