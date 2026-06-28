import type { JSX } from "react";
import GlassMacWallpaper from "./GlassMacWallpaper";
import GlassLandingDesktopDock from "./GlassLandingDesktopDock";

const DESKTOP_ICONS = [
  { label: "Projects", kind: "folder" as const, target: "projects" as const },
  { label: "Work", kind: "folder" as const },
  { label: "Design Assets", kind: "folder" as const },
  { label: "Screenshots", kind: "folder" as const },
  { label: "IIVO Glass", kind: "app" as const },
  { label: "Glass Beta", kind: "dmg" as const },
  { label: "Screen Digest", kind: "image" as const },
  { label: "Meeting Notes", kind: "doc" as const, target: "notes" as const },
  { label: "Release Notes", kind: "pdf" as const, target: "pdf" as const },
  { label: "Archive", kind: "zip" as const },
] as const;

/** Persistent full-viewport macOS desktop behind the Safari window and Glass overlay. */
export default function GlassLandingDesktopBackdrop(): JSX.Element {
  return (
    <div className="glass-landing__desktop-scene" aria-hidden="true">
      <GlassMacWallpaper />
      <div className="glass-landing__desktop-menubar">
        <div className="glass-landing__desktop-menubar-left">
          <span className="glass-landing__desktop-apple" />
          <span className="glass-landing__desktop-menubar-app">Finder</span>
          <span>File</span>
          <span>Edit</span>
          <span>View</span>
          <span>Go</span>
        </div>
        <div className="glass-landing__desktop-menubar-center">IIVO Glass — Intelligence Layer</div>
        <div className="glass-landing__desktop-menubar-right">
          <span className="glass-landing__desktop-menubar-wifi" />
          <span className="glass-landing__desktop-menubar-battery" />
          <span className="glass-landing__desktop-menubar-control" />
          <span className="glass-landing__desktop-menubar-time">9:41 AM</span>
        </div>
      </div>

      <div className="glass-landing__desktop-icons">
        {DESKTOP_ICONS.map((icon) => (
          <div
            key={icon.label}
            className="glass-landing__desktop-icon"
            data-desktop-target={"target" in icon ? icon.target : undefined}
          >
            <span
              className={`glass-landing__desktop-icon-glyph glass-landing__desktop-icon-glyph--${icon.kind}`}
            />
            <span className="glass-landing__desktop-icon-label">{icon.label}</span>
          </div>
        ))}
      </div>

      <GlassLandingDesktopDock />
      <div className="glass-landing__desktop-vignette" />
    </div>
  );
}
