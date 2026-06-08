import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

test("command bar wires native text context menu helpers", () => {
  const commandBar = readFileSync(join(ROOT, "renderer", "command", "CommandBar.tsx"), "utf8");
  const interaction = readFileSync(join(ROOT, "renderer", "glassTextInteraction.ts"), "utf8");

  assert.match(interaction, /prepareGlassTextContextMenu/);
  assert.match(interaction, /prepareGlassTextPointerDown/);
  assert.match(interaction, /syncGlassClickThrough/);
  assert.match(commandBar, /onPointerDownCapture=\{prepareGlassTextPointerDown\}/);
  assert.match(commandBar, /onContextMenu=\{prepareGlassTextContextMenu\}/);
  assert.match(commandBar, /syncGlassClickThrough/);
});
