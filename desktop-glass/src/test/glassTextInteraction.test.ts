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
  const notificationHost = readFileSync(
    join(ROOT, "renderer", "overlay", "GlassNotificationHost.tsx"),
    "utf8",
  );
  const windows = readFileSync(join(ROOT, "main", "windows.ts"), "utf8");
  const dockMain = readFileSync(join(ROOT, "renderer", "dock", "main.tsx"), "utf8");
  const commandMain = readFileSync(join(ROOT, "renderer", "command", "main.tsx"), "utf8");
  const overlay = readFileSync(join(ROOT, "renderer", "overlay", "Overlay.tsx"), "utf8");

  assert.match(interaction, /prepareGlassTextContextMenu/);
  assert.match(interaction, /prepareGlassTextPointerDown/);
  assert.match(interaction, /armIdeOverlayPointer/);
  assert.doesNotMatch(interaction, /setIgnoreMouse/);
  assert.match(commandBar, /onContextMenu=\{prepareGlassTextContextMenu\}/);
  assert.match(notificationHost, /onPointerDownCapture=\{handlePointerDownCapture\}/);
  assert.match(notificationHost, /ensureOverlayInteractive/);
  assert.match(windows, /configureOverlayClickThrough/);
  assert.match(windows, /overlayIdeInteractive/);
  assert.match(windows, /setOverlayIdeActive/);
  const ideShell = readFileSync(join(ROOT, "renderer", "overlay", "GlassIdeShell.tsx"), "utf8");
  assert.match(ideShell, /gide-tree-toggle/);
  assert.match(ideShell, /glassIdeClose/);
  assert.match(ideShell, /ideCollapsed/);
  assert.match(ideShell, /toggleTerminalExpanded/);
  assert.match(windows, /ensureChromeWindowInteractive/);
  assert.doesNotMatch(windows, /configureChromeClickThrough/);
  assert.doesNotMatch(windows, /reapplyClickThrough/);
  assert.doesNotMatch(dockMain, /glassClickThroughTracking/);
  assert.doesNotMatch(commandMain, /glassClickThroughTracking/);
  assert.doesNotMatch(overlay, /glassClickThroughTracking/);
  const syncRaised = windows.match(
    /export function syncOverlayPresentationRaised[\s\S]*?^}/m,
  )?.[0];
  assert.ok(syncRaised, "syncOverlayPresentationRaised should exist");
  assert.doesNotMatch(
    syncRaised!,
    /applyOverlayClickThrough\(windows\.overlay, true\)/,
    "syncOverlayPresentationRaised must not force click-through on every push()",
  );
});
