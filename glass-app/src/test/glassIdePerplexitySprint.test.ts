import assert from "node:assert/strict";
import test from "node:test";
import { canRollbackRun } from "../shared/coderCheckpoints.ts";
import { parseComposerMentions, resolveComposerMentions } from "../shared/glassIdeComposerMentions.ts";
import { groupDiffIntoHunks } from "../shared/glassIdeHunkSync.ts";
import { shouldAutoEnableQaForChanges } from "../shared/glassQaRisk.ts";

test("canRollbackRun is true when checkpoint has files", () => {
  assert.equal(canRollbackRun([
    { runId: "run-1", iteration: 1, at: 1, files: [{ path: "/a", relativePath: "a.ts" }] },
  ], "run-1"), true);
  assert.equal(canRollbackRun([], "run-1"), false);
});

test("parseComposerMentions extracts @ paths", () => {
  assert.deepEqual(
    parseComposerMentions("Fix @src/auth.ts and @lib/util.ts"),
    ["src/auth.ts", "lib/util.ts"],
  );
});

test("resolveComposerMentions resolves suffix paths", () => {
  const paths = ["src/auth.ts", "src/lib/util.ts", "README.md"];
  assert.deepEqual(resolveComposerMentions(["auth.ts"], paths), ["src/auth.ts"]);
});

test("groupDiffIntoHunks groups contiguous changes", () => {
  const hunks = groupDiffIntoHunks([
    { op: "equal", text: "a", beforeLineNo: 1, afterLineNo: 1 },
    { op: "add", text: "b", afterLineNo: 2 },
    { op: "add", text: "c", afterLineNo: 3 },
    { op: "equal", text: "d", beforeLineNo: 2, afterLineNo: 4 },
    { op: "remove", text: "e", beforeLineNo: 3 },
  ]);
  assert.equal(hunks.length, 2);
  assert.equal(hunks[0].startLine, 2);
  assert.equal(hunks[1].startLine, 3);
});

test("shouldAutoEnableQaForChanges detects auth paths", () => {
  const result = shouldAutoEnableQaForChanges(["src/auth/login.ts"], false);
  assert.equal(result.enable, true);
  assert.ok(result.riskyPaths.length > 0);
});
