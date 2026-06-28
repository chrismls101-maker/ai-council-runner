import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadGlassStorageProjectDetail } from "../main/storage/glassStorageProjectDetail.ts";
import { saveGlassStorageProjectsIndex } from "../main/storage/glassStorageProjectsStore.ts";
import { designToCodeProjectDir } from "../main/storage/glassStoragePaths.ts";
import type { GlassProjectRecord } from "../shared/glassStorageProjectTypes.ts";

async function withFixture(
  fn: (ctx: { userData: string; projectId: string }) => Promise<void>,
): Promise<void> {
  const userData = await fs.mkdtemp(join(tmpdir(), "glass-storage-detail-"));
  const projectId = "cap-test-1";
  const rootPath = designToCodeProjectDir(userData, projectId);
  await fs.mkdir(join(rootPath, "revisions"), { recursive: true });
  await fs.writeFile(join(rootPath, "result.tsx"), "export function Card() { return null; }\n", "utf8");
  await fs.writeFile(
    join(rootPath, "revisions", "2026-06-28_04-12-11_result.tsx"),
    "export function OldCard() { return null; }\n",
    "utf8",
  );
  await fs.writeFile(
    join(rootPath, "session.json"),
    JSON.stringify({
      version: 1,
      designCaptureId: projectId,
      createdAt: 1,
      updatedAt: 2,
      action: "react",
      stack: "react-tsx",
      refinementHistory: [{ text: "Tighter padding", createdAt: 3 }],
      latestWarnings: ["Border radius may differ"],
    }),
    "utf8",
  );
  await fs.writeFile(join(rootPath, "notes.md"), "# Notes\n\nSaved session.\n", "utf8");
  await fs.writeFile(join(rootPath, "thumb.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const record: GlassProjectRecord = {
    id: projectId,
    kind: "design-to-code",
    title: "Card — Design to Code",
    createdAt: 1,
    updatedAt: 2,
    category: "Projects",
    source: "Design to Code",
    designCaptureId: projectId,
    rootPath,
    primaryFilePath: join(rootPath, "result.tsx"),
    manifestPath: join(rootPath, "session.json"),
    previewThumbPath: join(rootPath, "thumb.png"),
    status: "warning",
    action: "react",
    stack: "react-tsx",
  };
  await saveGlassStorageProjectsIndex(userData, [record]);

  try {
    await fn({ userData, projectId });
  } finally {
    await fs.rm(userData, { recursive: true, force: true });
  }
}

describe("glassStorageProjectDetail", () => {
  test("loads primary output, manifest, revisions, and notes", async () => {
    await withFixture(async ({ userData, projectId }) => {
      const detail = await loadGlassStorageProjectDetail(userData, projectId);
      assert.ok(detail);
      assert.equal(detail.primaryFileName, "result.tsx");
      assert.match(detail.primaryContent, /export function Card/);
      assert.equal(detail.manifest?.refinementHistory.length, 1);
      assert.equal(detail.manifest?.latestWarnings?.[0], "Border radius may differ");
      assert.equal(detail.revisions.length, 1);
      assert.equal(detail.record.revisionCount, 1);
      assert.match(detail.notesMarkdown ?? "", /Saved session/);
      assert.ok(detail.previewDataUrl?.startsWith("data:image/png;base64,"));
      assert.ok(detail.files.some((f) => f.kind === "primary"));
      assert.ok(detail.files.some((f) => f.kind === "revision"));
    });
  });

  test("returns null for unknown project id", async () => {
    await withFixture(async ({ userData }) => {
      const detail = await loadGlassStorageProjectDetail(userData, "missing");
      assert.equal(detail, null);
    });
  });
});
