import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  extractionDedupeKey,
  resolveAgentSessionId,
  shouldSkipRecentExtraction,
} from "../main/glassMemoryPure.ts";
import { resolveAgentOutputForMemory } from "../main/glassMemoryOutput.ts";

test("resolveAgentSessionId replaces default with unique agent id", () => {
  const id = resolveAgentSessionId("default");
  assert.match(id, /^agent-[0-9a-f-]{36}$/);
  assert.equal(resolveAgentSessionId("my-session"), "my-session");
});

test("extractionDedupeKey prefers correlation id", () => {
  assert.equal(
    extractionDedupeKey("sess-1", "corr-9"),
    "extraction:corr-9",
  );
  assert.equal(
    extractionDedupeKey("sess-1"),
    "extraction:session:sess-1",
  );
});

test("shouldSkipRecentExtraction delegates to memory tag lookup", () => {
  const seen = new Set<string>();
  const hasRecent = (tag: string) => seen.has(tag);
  const tag = extractionDedupeKey("s1", "c1");
  assert.equal(shouldSkipRecentExtraction("s1", "c1", hasRecent), false);
  seen.add(tag);
  assert.equal(shouldSkipRecentExtraction("s1", "c1", hasRecent), true);
});

test("resolveAgentOutputForMemory prefers excerpt then file then summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glass-memory-"));
  const filePath = join(dir, "report.md");
  await writeFile(filePath, "# Full report body", "utf-8");

  try {
    assert.equal(
      await resolveAgentOutputForMemory({
        agentId: "research",
        researchExcerpt: "Excerpt wins",
      }),
      "Excerpt wins",
    );

    assert.equal(
      await resolveAgentOutputForMemory({
        agentId: "writing",
        outputPath: filePath,
        summary: "writing agent finished",
      }),
      "# Full report body",
    );

    assert.equal(
      await resolveAgentOutputForMemory({
        agentId: "writing",
        summary: "A useful short summary",
      }),
      "A useful short summary",
    );

    assert.equal(
      await resolveAgentOutputForMemory({
        agentId: "coder",
        summary: "coder agent finished",
      }),
      "",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
