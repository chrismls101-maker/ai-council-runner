import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "glass-browse-analytics-"));
const eventsFile = path.join(tmpDir, "glass-browse-events.jsonl");

process.env.GLASS_BROWSE_EVENTS_FILE = eventsFile;

const {
  appendGlassBrowseEvent,
  getGlassBrowseStats,
  glassBrowseStatsToken,
  isAuthorizedGlassBrowseStats,
  parseGlassBrowseEventPayload,
} = await import("../../dist/server/landing/glassBrowseAnalytics.js");

before(async () => {
  await fs.writeFile(eventsFile, "", "utf8");
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.GLASS_BROWSE_EVENTS_FILE;
});

describe("glass browse analytics", () => {
  it("rejects invalid event payloads", () => {
    assert.equal(parseGlassBrowseEventPayload(null), null);
    assert.equal(parseGlassBrowseEventPayload({ event: "nope" }), null);
  });

  it("accepts valid events with metadata", () => {
    const parsed = parseGlassBrowseEventPayload({
      event: "command",
      metadata: { category: "agents", length: "12" },
    });
    assert.deepEqual(parsed, {
      event: "command",
      metadata: { category: "agents", length: "12" },
    });
  });

  it("aggregates funnel stats", async () => {
    await appendGlassBrowseEvent("page_view");
    await appendGlassBrowseEvent("page_view");
    await appendGlassBrowseEvent("entered");
    await appendGlassBrowseEvent("command", { category: "privacy" });
    await appendGlassBrowseEvent("auto_exit");
    await appendGlassBrowseEvent("manual_exit", { source: "escape" });

    const stats = await getGlassBrowseStats();
    assert.equal(stats.pageViews, 2);
    assert.equal(stats.entered, 1);
    assert.equal(stats.commanded, 1);
    assert.equal(stats.autoExit, 1);
    assert.equal(stats.manualExit, 1);
    assert.equal(stats.commandRate, 1);
  });

  it("requires stats token for full funnel access", () => {
    const prev = process.env.GLASS_BROWSE_STATS_TOKEN;
    process.env.GLASS_BROWSE_STATS_TOKEN = "test-stats-secret";

    try {
      assert.equal(isAuthorizedGlassBrowseStats({
        get: (name: string) => (name === "authorization" ? "Bearer test-stats-secret" : undefined),
        query: {},
      } as never), true);

      assert.equal(isAuthorizedGlassBrowseStats({
        get: () => undefined,
        query: { token: "test-stats-secret" },
      } as never), true);

      assert.equal(isAuthorizedGlassBrowseStats({
        get: () => undefined,
        query: {},
      } as never), false);
    } finally {
      if (prev === undefined) delete process.env.GLASS_BROWSE_STATS_TOKEN;
      else process.env.GLASS_BROWSE_STATS_TOKEN = prev;
    }

    delete process.env.GLASS_BROWSE_STATS_TOKEN;
    assert.equal(glassBrowseStatsToken(), undefined);
  });
});
