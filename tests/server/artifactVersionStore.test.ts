import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

function test(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await test("artifactVersionStore: restore returns full section content", async () => {
  const {
    appendArtifactVersion,
    restoreArtifactSectionVersion,
    listArtifactVersions,
  } = await import("../../dist/server/artifacts/artifactVersionStore.js");
  const artifactId = `test-restore-${Date.now()}`;
  const version = {
    id: `v-restore-${Date.now()}`,
    artifactId,
    sectionId: "body",
    sectionLabel: "Email body",
    sectionKind: "email_body" as const,
    createdAt: new Date().toISOString(),
    source: "edit" as const,
    content: "Restored snapshot content for QA.",
    snapshotMode: "full" as const,
  };
  await appendArtifactVersion(version);
  const restored = await restoreArtifactSectionVersion(artifactId, version.id, {
    label: "Email body",
    kind: "email_body",
  });
  assert.ok(restored);
  assert.equal(restored!.section.content, version.content);
  assert.equal(restored!.restoredVersion.id, version.id);

  const storeDir = path.resolve(__dirname, "../../data/artifact-versions");
  try {
    await fs.unlink(path.join(storeDir, `${artifactId}.json`));
  } catch {
    /* cleanup */
  }
});

await test("artifactVersionStore: reference blob restores full content", async () => {
  const { appendArtifactVersion, restoreArtifactSectionVersion } = await import(
    "../../dist/server/artifacts/artifactVersionStore.js"
  );
  const artifactId = `test-ref-${Date.now()}`;
  const version = {
    id: `v-ref-${Date.now()}`,
    artifactId,
    sectionId: "body",
    sectionLabel: "Large body",
    sectionKind: "email_body" as const,
    createdAt: new Date().toISOString(),
    source: "edit" as const,
    content: "x".repeat(600 * 1024),
  };
  await appendArtifactVersion(version);
  const restored = await restoreArtifactSectionVersion(artifactId, version.id);
  assert.ok(restored);
  assert.equal(restored!.section.content, version.content);
  assert.equal(restored!.restoredVersion.snapshotMode, "reference");

  const storeDir = path.resolve(__dirname, "../../data/artifact-versions");
  const blobDir = path.resolve(__dirname, "../../data/artifact-version-blobs");
  try {
    await fs.unlink(path.join(storeDir, `${artifactId}.json`));
    await fs.rm(path.join(blobDir, artifactId), { recursive: true, force: true });
  } catch {
    /* cleanup */
  }
});

await test("artifactVersionStore: dedupes by content hash", async () => {
  const { appendArtifactVersion, listArtifactVersions } = await import(
    "../../dist/server/artifacts/artifactVersionStore.js"
  );
  const artifactId = `test-dedupe-${Date.now()}`;
  const base = {
    artifactId,
    sectionId: "body",
    createdAt: new Date().toISOString(),
    source: "edit" as const,
    content: "Same content",
    snapshotMode: "full" as const,
  };
  await appendArtifactVersion({ ...base, id: `v1-${Date.now()}` });
  await appendArtifactVersion({ ...base, id: `v2-${Date.now()}` });
  const listed = await listArtifactVersions(artifactId);
  assert.equal(listed.length, 1);

  const storeDir = path.resolve(__dirname, "../../data/artifact-versions");
  try {
    await fs.unlink(path.join(storeDir, `${artifactId}.json`));
  } catch {
    /* cleanup */
  }
});
