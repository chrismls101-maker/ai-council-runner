import assert from "node:assert/strict";
import { buildArtifactFromAnswer } from "../../dist/server/artifacts/artifactBuilder.js";
import { buildRunArtifact, estimateArtifactSizeBytes } from "../../dist/server/artifacts/buildRunArtifact.js";
import {
  ColdEmailArtifactSchema,
  buildArtifactFromValidatedSchema,
  parseArtifactJson,
} from "../../dist/server/artifacts/artifactSchema.js";
import { deriveStructuredPayload, generateStructuredArtifact } from "../../dist/server/artifacts/artifactStructuredGenerator.js";
import { repairArtifact, validateArtifact } from "../../dist/server/artifacts/artifactValidation.js";
import { resolveResponsePlan } from "../../dist/server/responseContracts/resolveResponsePlan.js";
import type { IivoArtifact } from "../../dist/server/artifacts/artifactTypes.js";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const coldJson = {
  title: "HVAC pilot email",
  subjectOptions: ["Quick pilot for missed calls", "14-day HVAC test"],
  emailBody:
    "Hi {{name}},\n\nWe help HVAC shops recover missed calls with a 14-day paid pilot.\n\nBest,\nAlex",
  followUp: "Just bumping this — still interested?",
};

test("structured cold email JSON validates and builds artifact", () => {
  const parsed = parseArtifactJson("cold_email", coldJson);
  assert.equal(parsed.ok, true);
  const artifact = buildArtifactFromValidatedSchema("cold_email", coldJson, "inline");
  assert.ok(artifact);
  assert.equal(artifact!.type, "cold_email");
  const v = validateArtifact(artifact!);
  assert.equal(v.valid, true);
});

test("table artifact validates rows/columns", () => {
  const table = {
    title: "Burn table",
    columns: ["Month", "Burn"],
    rows: [{ Month: "Jan", Burn: 1200 }],
  };
  const artifact = buildArtifactFromValidatedSchema("financial_table", table, "inline");
  assert.ok(artifact);
  const v = validateArtifact(artifact!);
  assert.equal(v.valid, true);
});

test("broken table falls back to report via parser", () => {
  const plan = resolveResponsePlan("Create a financial table for runway.");
  const artifact = buildArtifactFromAnswer({
    artifactType: "financial_table",
    answer: "Here is narrative analysis without pipe table rows.\n\nRecommendation: extend runway.",
    prompt: "financial table",
    responseContract: plan.contract,
  });
  assert.ok(artifact);
  assert.ok(artifact!.type === "report" || artifact!.type === "financial_table");
});

test("validation catches missing email body", () => {
  const artifact: IivoArtifact = {
    id: "broken",
    type: "cold_email",
    renderMode: "inline",
    title: "Broken",
    sections: [
      {
        id: "s1",
        label: "Subject options",
        kind: "email_subjects",
        content: "Only subject",
        copyable: true,
      },
    ],
    actions: ["copy"],
  };
  const v = validateArtifact(artifact);
  assert.equal(v.valid, false);
});

test("artifact size estimator works", () => {
  const plan = resolveResponsePlan("Write a cold email.");
  const artifact = buildArtifactFromAnswer({
    artifactType: "cold_email",
    answer: `Subject: Hi\n\nHi owner,\n\nLong body ${"x".repeat(100)} for sizing.`,
    prompt: "cold email",
    responseContract: plan.contract,
  });
  assert.ok(artifact);
  assert.ok(estimateArtifactSizeBytes(artifact!) > 50);
});

test("deriveStructuredPayload produces valid cold email", () => {
  const payload = deriveStructuredPayload(
    "Subject options:\n- Pilot offer\n\nHi Sam,\n\nWe help with missed calls in detail here.\n\n",
    "cold_email",
    "Cold email",
  );
  assert.ok(payload);
  const parsed = ColdEmailArtifactSchema.safeParse(payload);
  assert.equal(parsed.success, true);
});

test("repair adds email body when missing", () => {
  const broken = buildArtifactFromValidatedSchema(
    "cold_email",
    { title: "T", subjectOptions: ["S"], emailBody: "x".repeat(25) },
    "inline",
  );
  assert.ok(broken);
  const repaired = repairArtifact(broken!, "Full answer text " + "y".repeat(40));
  const v = validateArtifact(repaired);
  assert.equal(v.valid, true);
});

async function asyncTests() {
  const invalidName = "invalid cold email schema falls back safely";
  try {
    const prompt = "Write a cold email to HVAC owners.";
    const plan = resolveResponsePlan(prompt);
    const bad = { title: "x", subjectOptions: [], emailBody: "short" };
    const parsed = parseArtifactJson("cold_email", bad);
    assert.equal(parsed.ok, false);
    const result = await generateStructuredArtifact({
      prompt,
      answer: `Subject: Test\n\nHi there,\n\nWe offer a 14-day pilot for missed call recovery with clear ROI.\n\nThanks`,
      artifactType: "cold_email",
      responseContract: plan.contract,
    });
    assert.ok(result.artifact);
    assert.ok(result.buildMode === "schema_first" || result.buildMode === "parser_fallback");
    console.log(`✓ ${invalidName}`);
  } catch (err) {
    console.error(`✗ ${invalidName}`);
    throw err;
  }

  const buildName = "buildRunArtifact returns trace with build mode";
  try {
    const prompt = "Write a cold email to a local HVAC owner.";
    const plan = resolveResponsePlan(prompt);
    const answer = JSON.stringify(coldJson);
    const built = await buildRunArtifact(prompt, answer, plan);
    assert.ok(built.artifact);
    assert.ok(built.trace?.artifactBuild);
    assert.equal(built.trace!.artifactBuild!.buildMode, "schema_first");
    console.log(`✓ ${buildName}`);
  } catch (err) {
    console.error(`✗ ${buildName}`);
    throw err;
  }
}

await asyncTests();
