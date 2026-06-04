export interface GlassE2eWindowMetadata {
  name: "overlay" | "commandBar" | "dock" | "panel";
  exists: boolean;
  visible: boolean;
  bounds: { x: number; y: number; width: number; height: number } | null;
  alwaysOnTop: boolean;
  focusable: boolean;
  ignoreMouseEvents: boolean | null;
  displayId: number | null;
}
