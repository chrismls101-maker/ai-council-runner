import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requiresManualApproval,
  shouldAutoApproveCoderTool,
  shouldAutoSkipCoderTool,
} from "../shared/agentApprovalMode.ts";

test("trust_edits auto-approves edit and create only", () => {
  assert.equal(shouldAutoApproveCoderTool("trust_edits", "edit_file"), true);
  assert.equal(shouldAutoApproveCoderTool("trust_edits", "create_file"), true);
  assert.equal(shouldAutoApproveCoderTool("trust_edits", "delete_file"), false);
  assert.equal(shouldAutoApproveCoderTool("normal", "edit_file"), false);
});

test("skip_all skips without manual UI", () => {
  assert.equal(shouldAutoSkipCoderTool("skip_all"), true);
  assert.equal(shouldAutoSkipCoderTool("normal"), false);
});

test("delete always requires manual approval", () => {
  assert.equal(requiresManualApproval("delete_file"), true);
  assert.equal(requiresManualApproval("edit_file"), false);
});
