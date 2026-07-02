/**
 * Glass Guide — E2E stubs with hardcoded regions.
 */

import type { OrientationRegion } from "../shared/liveOrientationTypes.ts";
import { deriveOrientationActions } from "../shared/liveOrientationTypes.ts";

export const E2E_ORIENTATION_REGIONS: OrientationRegion[] = [
  {
    id: "sidebar-nav",
    label: "Sidebar",
    bounds: { x: 0, y: 0.08, width: 0.18, height: 0.84 },
    priority: 1,
    role: "navigation",
    l1: "This is where you switch between pages and workspaces.",
    l2: null,
    l3: null,
    l4: deriveOrientationActions("navigation"),
  },
  {
    id: "main-editor",
    label: "Editor",
    bounds: { x: 0.2, y: 0.12, width: 0.55, height: 0.7 },
    priority: 2,
    role: "content",
    l1: "Your main work area — documents and blocks live here.",
    l2: null,
    l3: null,
    l4: deriveOrientationActions("content"),
  },
  {
    id: "top-toolbar",
    label: "Toolbar",
    bounds: { x: 0.2, y: 0.02, width: 0.55, height: 0.08 },
    priority: 3,
    role: "action",
    l1: "Quick actions like share, export, and formatting.",
    l2: null,
    l3: null,
    l4: deriveOrientationActions("action"),
  },
];

export function buildE2eOrientationRegions(appName: string): OrientationRegion[] {
  return E2E_ORIENTATION_REGIONS.map((r) => ({
    ...r,
    l1: r.l1.replace("documents", `${appName} content`),
  }));
}

export const E2E_ORIENTATION_L2 = {
  found: true as const,
  guidance: "Use the template gallery instead of building from scratch — it's faster for recurring reports.",
};

export function buildE2eOrientationL2(): { found: boolean; guidance: string | null } {
  return E2E_ORIENTATION_L2;
}
