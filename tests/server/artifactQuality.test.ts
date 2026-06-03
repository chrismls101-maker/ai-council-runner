import assert from "node:assert/strict";
import { scoreArtifactQuality } from "../../dist/server/artifacts/artifactQuality.js";
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

test("artifactQuality: cold email flags missing CTA", () => {
  const sections: ArtifactSection[] = [
    { id: "subjects", label: "Subject options", kind: "email_subjects", content: "Hi" },
    { id: "body", label: "Email body", kind: "email_body", content: "We help HVAC shops." },
  ];
  const score = scoreArtifactQuality("cold_email", sections);
  assert.ok(score.overall > 0);
  assert.ok(score.missingPieces.some((m) => /cta/i.test(m)) || score.suggestedFixes.some((f) => /cta/i.test(f.label)));
});

test("artifactQuality: financial table flags missing assumptions", () => {
  const sections: ArtifactSection[] = [
    {
      id: "table",
      label: "Table",
      kind: "table",
      content: {
        columns: ["Month", "Burn"],
        rows: [{ Month: "Jan", Burn: 1000 }],
        totals: { Burn: 1000 },
      },
    },
  ];
  const score = scoreArtifactQuality("financial_table", sections);
  assert.ok(score.missingPieces.some((m) => /assumption/i.test(m)));
});
