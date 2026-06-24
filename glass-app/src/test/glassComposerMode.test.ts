import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODER_PLAN_MODE_TOOL_NAMES,
  DEFAULT_GLASS_CODER_COMPOSER_MODE,
  parseGlassCoderComposerMode,
} from "../shared/glassComposerMode.ts";

test("parseGlassCoderComposerMode defaults to agent", () => {
  assert.equal(parseGlassCoderComposerMode(undefined), DEFAULT_GLASS_CODER_COMPOSER_MODE);
  assert.equal(parseGlassCoderComposerMode("agent"), "agent");
  assert.equal(parseGlassCoderComposerMode("plan"), "plan");
});

test("CODER_PLAN_MODE_TOOL_NAMES excludes write tools", () => {
  assert.ok(CODER_PLAN_MODE_TOOL_NAMES.has("read_file"));
  assert.ok(!CODER_PLAN_MODE_TOOL_NAMES.has("edit_file"));
  assert.ok(!CODER_PLAN_MODE_TOOL_NAMES.has("create_file"));
  assert.ok(!CODER_PLAN_MODE_TOOL_NAMES.has("delete_file"));
});
