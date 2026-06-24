import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCoderCheckpoint,
  latestCheckpointForRun,
} from "../shared/coderCheckpoints.ts";

test("buildCoderCheckpoint collects applied files for run", () => {
  const cp = buildCoderCheckpoint("r1", 2, [
    {
      runId: "r1",
      path: "/p/a.ts",
      relativePath: "a.ts",
      action: "applied",
      description: "edit",
      at: 1,
      backupPath: "/backup/a.ts",
    },
    {
      runId: "r2",
      path: "/p/b.ts",
      relativePath: "b.ts",
      action: "applied",
      description: "edit",
      at: 2,
    },
    {
      runId: "r1",
      path: "/p/c.ts",
      relativePath: "c.ts",
      action: "skipped",
      description: "skip",
      at: 3,
    },
  ]);
  assert.equal(cp.files.length, 1);
  assert.equal(cp.files[0]?.relativePath, "a.ts");
  assert.equal(cp.files[0]?.backupPath, "/backup/a.ts");
});

test("latestCheckpointForRun picks highest iteration", () => {
  const list = [
    buildCoderCheckpoint("r1", 1, []),
    buildCoderCheckpoint("r1", 3, []),
    buildCoderCheckpoint("r1", 2, []),
  ];
  assert.equal(latestCheckpointForRun(list, "r1")?.iteration, 3);
});
