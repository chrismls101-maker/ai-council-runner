import assert from "node:assert/strict";
import {
  createArtifactSnapshot,
  estimateArtifactSizeBytes,
  INLINE_ARTIFACT_SNAPSHOT_MAX_BYTES,
  shouldStoreArtifactByReference,
} from "../../src/utils/artifactSnapshot.ts";
import type { IivoArtifact } from "../../src/types/artifacts.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const smallArtifact: IivoArtifact = {
  id: "art-small",
  type: "cold_email",
  renderMode: "inline",
  title: "Small",
  sections: [
    {
      id: "s1",
      label: "Email",
      kind: "email_body",
      content: "Hi there, short email.",
      copyable: true,
    },
  ],
  actions: ["copy"],
};

test("small artifact snapshot stores inline", () => {
  const snap = createArtifactSnapshot(smallArtifact, "run-1");
  assert.equal(snap.mode, "inline");
  if (snap.mode === "inline") {
    assert.equal(snap.artifact.id, "art-small");
  }
});

test("large artifact snapshot stores reference", () => {
  const large: IivoArtifact = {
    ...smallArtifact,
    id: "art-large",
    renderMode: "canvas",
    type: "canvas_project",
    sections: [
      {
        id: "s1",
        label: "Section",
        kind: "text",
        content: "x".repeat(INLINE_ARTIFACT_SNAPSHOT_MAX_BYTES + 1000),
        copyable: true,
      },
    ],
  };
  assert.ok(shouldStoreArtifactByReference(large));
  const snap = createArtifactSnapshot(large, "run-large");
  assert.equal(snap.mode, "reference");
  if (snap.mode === "reference") {
    assert.equal(snap.artifactId, "run-large");
    assert.ok(snap.sizeBytes > INLINE_ARTIFACT_SNAPSHOT_MAX_BYTES);
  }
});

test("estimateArtifactSizeBytes matches JSON length order", () => {
  const smallSize = estimateArtifactSizeBytes(smallArtifact);
  const largeContent = { ...smallArtifact, sections: [{ ...smallArtifact.sections[0]!, content: "z".repeat(50000) }] };
  const largeSize = estimateArtifactSizeBytes(largeContent);
  assert.ok(largeSize > smallSize);
});
