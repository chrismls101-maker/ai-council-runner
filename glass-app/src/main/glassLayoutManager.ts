/**
 * Dynamic layout for IIVO Glass windows (Electron main process).
 *
 * Display target can be primary, a specific display id, or follow mouse.
 * Pure math lives in shared/glassLayoutMath.ts (testable without Electron).
 */

import { screen, type Display } from "electron";
import {
  clampDockSize,
  commandBarLayoutFromDisplay,
  dockLayoutFromDisplay,
  dockLeftRailLayoutFromDisplay,
  listenNotesPadLayoutFromDisplay,
  overlayLayoutFromDisplay,
  overlayLayoutSpanningDisplays,
  panelLayoutFromDisplay,
  settingsLayoutFromDisplay,
  repositionDockInWorkArea,
  type CommandBarLayout,
  type DisplayLayoutContext,
  type DockLayout,
  type LayoutRect,
  type OverlayLayout,
  type PanelLayout,
} from "../shared/glassLayoutMath.ts";
import type { PanelLayoutOptions } from "../shared/glassLayoutMath.ts";
import {
  DEFAULT_GLASS_LAYOUT_PRESET,
  type GlassLayoutPreset,
} from "../shared/glassLayoutTypes.ts";
import type { GlassDisplayTarget, DockPlacement } from "../shared/glassSettings.ts";
import { resolveEffectiveDisplayId } from "../shared/displayInfo.ts";
import { displayIdContainingPoint } from "../shared/displayTargetMath.ts";

export type { GlassLayoutPreset } from "../shared/glassLayoutTypes.ts";
export {
  DEFAULT_GLASS_LAYOUT_PRESET,
  GLASS_LAYOUT_PRESETS,
  parseLayoutPreset,
} from "../shared/glassLayoutTypes.ts";
export type {
  CommandBarLayout,
  DisplayLayoutContext,
  DockLayout,
  OverlayLayout,
  PanelLayout,
} from "../shared/glassLayoutMath.ts";

export function displayContextFromDisplay(display: Display): DisplayLayoutContext {
  return {
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
    scaleFactor: display.scaleFactor,
    id: display.id,
  };
}

export function getPrimaryDisplayContext(): DisplayLayoutContext {
  return displayContextFromDisplay(screen.getPrimaryDisplay());
}

export function listDisplayIds(): number[] {
  return screen.getAllDisplays().map((d) => d.id);
}

export function listAllDisplayContexts(): DisplayLayoutContext[] {
  return screen.getAllDisplays().map(displayContextFromDisplay);
}

export function resolveDisplayContext(target: GlassDisplayTarget): DisplayLayoutContext {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const primaryId = primary.id;
  const cursor = screen.getCursorScreenPoint();
  const displayBounds = displays.map((d) => ({ id: d.id, bounds: { ...d.bounds } }));

  const activeId = resolveEffectiveDisplayId(target, displayBounds, cursor, primaryId);
  const match = displays.find((d) => d.id === activeId);
  if (match) return displayContextFromDisplay(match);
  return displayContextFromDisplay(primary);
}

export class GlassLayoutManager {
  private preset: GlassLayoutPreset;
  private displayTarget: GlassDisplayTarget;
  private displayChangeHandler: (() => void) | null = null;
  private macVisibleWorkArea: LayoutRect | null = null;

  constructor(
    preset: GlassLayoutPreset = DEFAULT_GLASS_LAYOUT_PRESET,
    displayTarget: GlassDisplayTarget = "primary",
  ) {
    this.preset = preset;
    this.displayTarget = displayTarget;
  }

  getPreset(): GlassLayoutPreset {
    return this.preset;
  }

  setPreset(preset: GlassLayoutPreset): void {
    this.preset = preset;
  }

  getDisplayTarget(): GlassDisplayTarget {
    return this.displayTarget;
  }

  setMacVisibleWorkArea(workArea: LayoutRect | null): void {
    this.macVisibleWorkArea = workArea;
  }

  clearMacVisibleWorkArea(): void {
    this.macVisibleWorkArea = null;
  }

  setDisplayTarget(target: GlassDisplayTarget): void {
    this.displayTarget = target;
  }

  getDisplay(): DisplayLayoutContext {
    const base = resolveDisplayContext(this.displayTarget);
    if (this.macVisibleWorkArea) {
      return {
        ...base,
        workArea: { ...this.macVisibleWorkArea },
        workAreaSource: "macos-visible-frame",
      };
    }
    return base;
  }

  /** Electron screen API context — ignores NSScreen.visibleFrame override. */
  getElectronDisplay(): DisplayLayoutContext {
    return resolveDisplayContext(this.displayTarget);
  }

  getOverlayLayout(): OverlayLayout {
    if (this.displayTarget === "all_displays") {
      const all = listAllDisplayContexts();
      if (all.length > 1) {
        return overlayLayoutSpanningDisplays(all);
      }
    }
    return overlayLayoutFromDisplay(this.getDisplay());
  }

  getPanelLayout(options?: PanelLayoutOptions & { dockPlacement?: DockPlacement }): PanelLayout {
    const placement = options?.dockPlacement ?? "left-rail";
    return panelLayoutFromDisplay(this.getDisplay(), this.preset, {
      dockBounds: options?.dockBounds,
      dockPlacement: placement === "left-rail" ? "left-rail" : "top",
    });
  }

  getSettingsLayout(): PanelLayout {
    return settingsLayoutFromDisplay(this.getDisplay());
  }

  getNotesPadLayout(): PanelLayout {
    return listenNotesPadLayoutFromDisplay(this.getDisplay());
  }

  getCommandBarLayout(): CommandBarLayout {
    return commandBarLayoutFromDisplay(this.getDisplay());
  }

  getDockLayout(
    contentWidth?: number,
    contentHeight?: number,
    clampOptions?: import("../shared/glassLayoutMath.ts").DockClampOptions,
    placement: DockPlacement = "top",
  ): DockLayout {
    const ctx = this.getDisplay();
    if (placement === "left-rail") {
      return dockLeftRailLayoutFromDisplay(ctx, contentWidth, contentHeight, clampOptions);
    }
    return dockLayoutFromDisplay(
      ctx,
      this.preset,
      contentWidth,
      contentHeight,
      clampOptions,
    );
  }

  clampDockSize(
    width: number,
    height: number,
    clampOptions?: import("../shared/glassLayoutMath.ts").DockClampOptions,
  ): { width: number; height: number } {
    return clampDockSize(this.getDisplay(), width, height, clampOptions);
  }

  repositionDock(
    current: Electron.Rectangle,
    nextWidth: number,
    nextHeight: number,
    clampOptions?: import("../shared/glassLayoutMath.ts").DockClampOptions,
  ): Electron.Rectangle {
    return repositionDockInWorkArea(this.getDisplay(), this.preset, current, nextWidth, nextHeight, clampOptions);
  }

  onDisplayChanged(callback: () => void): void {
    this.dispose();
    this.displayChangeHandler = callback;
    screen.on("display-metrics-changed", callback);
    screen.on("display-added", callback);
    screen.on("display-removed", callback);
  }

  dispose(): void {
    if (!this.displayChangeHandler) return;
    screen.removeListener("display-metrics-changed", this.displayChangeHandler);
    screen.removeListener("display-added", this.displayChangeHandler);
    screen.removeListener("display-removed", this.displayChangeHandler);
    this.displayChangeHandler = null;
    this.macVisibleWorkArea = null;
  }
}
