import assert from "node:assert/strict";
import { test } from "node:test";
import { openGlassHandoffUrl, setGlassHandoffOpenImpl } from "../shared/glassHandoffOpen.ts";

test("openGlassHandoffUrl uses injectable impl", async () => {
  setGlassHandoffOpenImpl(async (url) => ({ ok: true, url }));
  const result = await openGlassHandoffUrl("http://localhost:5173/?lensAsk=test");
  assert.equal(result.ok, true);
  if (result.ok) assert.match(result.url, /lensAsk=test/);
  setGlassHandoffOpenImpl(null);
});

test("openGlassHandoffUrl reports clipboard fallback on failure", async () => {
  setGlassHandoffOpenImpl(async (url) => ({
    ok: false,
    url,
    error: "blocked",
    copiedToClipboard: true,
  }));
  const result = await openGlassHandoffUrl("http://localhost/?lensAsk=x");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.copiedToClipboard, true);
    assert.equal(result.error, "blocked");
  }
  setGlassHandoffOpenImpl(null);
});

test("openGlassHandoffUrl fails when opener not configured", async () => {
  setGlassHandoffOpenImpl(null);
  const result = await openGlassHandoffUrl("http://localhost/");
  assert.equal(result.ok, false);
});
