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

await test("artifactShareStore: create and disable share", async () => {
  const { createArtifactShare, getArtifactShare, setArtifactShareEnabled } = await import(
    "../../dist/server/artifacts/artifactShareStore.js"
  );
  const record = await createArtifactShare({
    artifactId: `art-share-${Date.now()}`,
    title: "Cold Email",
    type: "cold_email",
  });
  assert.ok(record.shareId);
  const fetched = await getArtifactShare(record.shareId);
  assert.equal(fetched?.enabled, true);
  const disabled = await setArtifactShareEnabled(record.shareId, false);
  assert.equal(disabled?.enabled, false);
  const after = await getArtifactShare(record.shareId);
  assert.equal(after?.enabled, false);

  const storeDir = path.resolve(__dirname, "../../data/artifact-shares");
});

await test("artifactShareStore: share payload includes artifact snapshot", async () => {
  const { createArtifactShare, getArtifactSharePayload } = await import(
    "../../dist/server/artifacts/artifactShareStore.js"
  );
  const artifact = {
    id: `art-share-payload-${Date.now()}`,
    type: "cold_email" as const,
    renderMode: "inline" as const,
    title: "Shared Cold Email",
    sections: [{ id: "body", label: "Body", kind: "email_body" as const, content: "Hello" }],
    actions: ["copy" as const],
  };
  const record = await createArtifactShare({
    artifactId: artifact.id,
    title: artifact.title,
    type: artifact.type,
    artifact,
  });
  const payload = await getArtifactSharePayload(record.shareId);
  assert.ok(payload?.artifact);
  assert.equal(payload!.artifact!.title, artifact.title);

  const storeDir = path.resolve(__dirname, "../../data/artifact-shares");
  const blobDir = path.resolve(__dirname, "../../data/artifact-share-blobs");
  try {
    await fs.unlink(path.join(storeDir, `${record.shareId}.json`));
    await fs.unlink(path.join(blobDir, `${record.shareId}.json`));
  } catch {
    /* cleanup */
  }
});
