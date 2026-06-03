import assert from "node:assert/strict";
import type { IivoArtifact } from "../../src/types/artifacts.ts";
import {
  createVersionState,
  recordSectionVersion,
  restoreSectionVersion,
  seedOriginalVersions,
  versionCount,
} from "../../src/utils/artifactVersioning.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const artifact: IivoArtifact = {
  id: "art-test",
  type: "cold_email",
  renderMode: "inline",
  title: "Test",
  sections: [
    { id: "body", label: "Body", kind: "email_body", content: "Version one" },
  ],
  actions: ["copy"],
};

test("artifactVersioning: seed and record versions", () => {
  let state = createVersionState(artifact.id);
  state = seedOriginalVersions(state, artifact.sections);
  assert.ok(versionCount(state) >= 1);

  const section = artifact.sections[0]!;
  state = recordSectionVersion(state, section, "regenerate", { instruction: "shorter" });
  assert.equal(versionCount(state), 2);
});

test("artifactVersioning: restore previous content", () => {
  let state = createVersionState(artifact.id);
  state = seedOriginalVersions(state, artifact.sections);
  const section = artifact.sections[0]!;
  const versionId = state.sectionVersions[section.id]![0]!.id;
  const updated: IivoArtifact = {
    ...artifact,
    sections: [{ ...section, content: "Version two" }],
  };
  const result = restoreSectionVersion(updated, state, versionId);
  assert.ok(result);
  assert.equal(result!.artifact.sections[0]!.content, "Version one");
});
