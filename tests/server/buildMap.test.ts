import assert from "node:assert/strict";
import { buildArtifactMap } from "../../dist/server/artifacts/buildMap.js";
import type { ArtifactSection } from "../../dist/server/artifacts/artifactTypes.js";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const landingSections: ArtifactSection[] = [
  { id: "hero", label: "Hero", kind: "text", content: "A".repeat(100) },
  { id: "problem", label: "Problem", kind: "text", content: "B".repeat(100) },
  { id: "cta", label: "CTA", kind: "cta", content: "Get started today with a free trial — book a demo in one click." },
];

test("buildMap: landing page includes hero/problem/cta template", () => {
  const map = buildArtifactMap("landing_page_copy", "Landing", landingSections);
  assert.equal(map.artifactType, "landing_page_copy");
  const ids = map.sections.map((s) => s.id);
  assert.ok(ids.includes("hero"));
  assert.ok(ids.includes("problem"));
  assert.ok(ids.includes("cta"));
  assert.ok(map.overallCompleteness >= 20);
});

test("buildMap: missing sections marked missing", () => {
  const map = buildArtifactMap("cold_email", "Email", [
    { id: "body", label: "Email body", kind: "email_body", content: "Hi there" },
  ]);
  const missing = map.sections.filter((s) => s.status === "missing");
  assert.ok(missing.length > 0);
});
