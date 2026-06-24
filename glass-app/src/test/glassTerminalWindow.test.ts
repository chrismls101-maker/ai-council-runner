import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GLASS_TERMINAL_RAIL_TOP_INSET_PX,
  terminalWindowBoundsBesideDock,
} from "../main/glassTerminalWindow.ts";

test("terminal beside left rail opens to the right at work-area top", () => {
  const workArea = { x: 0, y: 25, width: 2560, height: 1575 };
  const dockBounds = { x: 24, y: 700, width: 52, height: 380 };
  const bounds = terminalWindowBoundsBesideDock(dockBounds, 800, 400, workArea);

  assert.equal(bounds.y, workArea.y + GLASS_TERMINAL_RAIL_TOP_INSET_PX);
  assert.equal(bounds.x, dockBounds.x + dockBounds.width + 10);
});
