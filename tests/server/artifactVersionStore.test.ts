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

await test("artifactVersionStore: append and list versions", async () => {
  const { appendArtifactVersion, listArtifactVersions } = await import(
    "../../dist/server/artifacts/artifactVersionStore.js"
  );
  const artifactId = `test-art-${Date.now()}`;
  const version = {
    id: `v-${Date.now()}`,
    artifactId,
    sectionId: "body",
    createdAt: new Date().toISOString(),
    source: "edit" as const,
    content: "Before edit text content here.",
  };
  await appendArtifactVersion(version);
  const listed = await listArtifactVersions(artifactId);
  assert.ok(listed.some((v) => v.id === version.id));

  const storeDir = path.resolve(__dirname, "../../data/artifact-versions");
  try {
    await fs.unlink(path.join(storeDir, `${artifactId}.json`));
  } catch {
    /* cleanup */
  }
});
