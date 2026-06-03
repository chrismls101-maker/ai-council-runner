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

await test("artifactRelationships: save relationship and child artifact", async () => {
  const { saveRelationship, listRelationships, getChildArtifact } = await import(
    "../../dist/server/artifacts/artifactRelationshipStore.js"
  );
  const parentId = `parent-${Date.now()}`;
  const child = {
    id: `child-${Date.now()}`,
    type: "follow_up_sequence" as const,
    renderMode: "canvas" as const,
    title: "Follow-ups",
    sections: [
      { id: "e1", label: "Email 1", kind: "email_body" as const, content: "Hi" },
    ],
    actions: ["copy" as const],
  };
  const rel = {
    parentArtifactId: parentId,
    childArtifactId: child.id,
    transformType: "follow_up_sequence",
    createdAt: new Date().toISOString(),
  };
  await saveRelationship(rel, child);
  const listed = await listRelationships(parentId);
  assert.equal(listed.length, 1);
  const loaded = await getChildArtifact(child.id);
  assert.equal(loaded?.id, child.id);

  const relDir = path.resolve(__dirname, "../../data/artifact-relationships");
  const childDir = path.resolve(__dirname, "../../data/artifact-children");
  try {
    await fs.unlink(path.join(relDir, `${parentId}.json`));
    await fs.unlink(path.join(childDir, `${child.id}.json`));
  } catch {
    /* cleanup */
  }
});
