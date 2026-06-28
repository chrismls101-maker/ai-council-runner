import type { GlassDashboardNav } from "./glassDashboardNav.ts";
import type { PanelTab } from "./types.ts";

export type CaptureSubTab = "notes" | "transcript" | "timeline" | "insights" | "summary";

export type GlassSettingsSection =
  | "providers"
  | "context"
  | "audio"
  | "components"
  | "account"
  | "dev"
  | "shortcuts"
  | "about";

export interface PanelNavigationTarget {
  panelTab: PanelTab;
  captureSubTab?: CaptureSubTab;
  openSettings?: boolean;
  settingsSection?: GlassSettingsSection;
  openDashboardNav?: GlassDashboardNav;
}

/** Map legacy / external tab IDs to the new panel information architecture. */
export function resolvePanelNavigation(tab: PanelTab): PanelNavigationTarget {
  switch (tab) {
    case "capture":
      return { panelTab: "capture" };
    case "session":
      return { panelTab: "session" };
    case "copilot":
      return { panelTab: "session" };
    case "live-notes":
      return { panelTab: "capture", captureSubTab: "notes" };
    case "summary":
      return { panelTab: "capture", captureSubTab: "summary" };
    case "insights":
      return { panelTab: "capture", captureSubTab: "insights" };
    case "audio":
      return { panelTab: "audio" };
    case "founder":
      return { panelTab: "founder" };
    case "diagnostics":
      return { panelTab: "diagnostics" };
    case "power-stack":
      return { panelTab: "session" };
    case "setup":
      return { panelTab: "session", openDashboardNav: "setup" };
    case "installations":
      return { panelTab: "session", openSettings: true, settingsSection: "components" };
    case "account":
      return { panelTab: "session", openSettings: true, settingsSection: "account" };
    case "context":
    case "hypotheses":
    case "actions":
      return { panelTab: "capture", captureSubTab: "notes" };
    default:
      return { panelTab: tab };
  }
}

/** Overlay session cards should open the timeline under Capture, not Session control. */
export function resolveOverlayPanelNavigation(
  tab: "session" | "insights",
): PanelNavigationTarget {
  if (tab === "insights") {
    return { panelTab: "capture", captureSubTab: "insights" };
  }
  return { panelTab: "capture", captureSubTab: "timeline" };
}
