import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {
  assertPathInProjectRoot,
  proposeEditContent,
  relativePathFromRoot,
} from "../main/agentCoderTools.ts";

const PROJECT = path.join(os.homedir(), "Projects", "demo-app");

describe("assertPathInProjectRoot", () => {
  it("allows paths inside the project root", () => {
    const inside = path.join(PROJECT, "src", "index.ts");
    assert.equal(assertPathInProjectRoot(inside, PROJECT), null);
  });

  it("rejects paths outside the project root", () => {
    const outside = path.join(os.homedir(), "other", "secret.ts");
    assert.match(assertPathInProjectRoot(outside, PROJECT) ?? "", /outside the project root/);
  });
});

describe("proposeEditContent", () => {
  const filePath = path.join(PROJECT, "README.md");
  const content = "# Title\n\nHello world.\n";

  it("produces a diff when old_string matches once", () => {
    const result = proposeEditContent(
      filePath,
      content,
      "hash",
      true,
      PROJECT,
      "Hello world.",
      "Hello Glass.",
      "Update greeting",
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.proposedContent.includes("Hello Glass."));
      assert.equal(result.approval.relativePath, relativePathFromRoot(filePath, PROJECT));
      assert.ok(result.approval.diff.added > 0);
    }
  });

  it("errors when old_string is missing", () => {
    const result = proposeEditContent(
      filePath,
      content,
      "hash",
      true,
      PROJECT,
      "missing text",
      "x",
      "noop",
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /not found/);
    }
  });

  it("errors when old_string matches multiple times", () => {
    const dup = "a\na\n";
    const result = proposeEditContent(
      filePath,
      dup,
      "hash",
      true,
      PROJECT,
      "a",
      "b",
      "dup",
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /ambiguous/);
    }
  });
});
