import type { JSX } from "react";

/** Sequoia/Tahoe-style macOS mesh — layered aurora, drift, light sweep. */
export default function GlassMacWallpaper(): JSX.Element {
  return (
    <div className="glass-mac-wallpaper" aria-hidden="true">
      <div className="glass-mac-wallpaper__base" />
      <div className="glass-mac-wallpaper__mesh glass-mac-wallpaper__mesh--back">
        <span className="glass-mac-wallpaper__blob glass-mac-wallpaper__blob--a" />
        <span className="glass-mac-wallpaper__blob glass-mac-wallpaper__blob--b" />
        <span className="glass-mac-wallpaper__blob glass-mac-wallpaper__blob--d" />
        <span className="glass-mac-wallpaper__blob glass-mac-wallpaper__blob--e" />
      </div>
      <div className="glass-mac-wallpaper__aurora" />
      <div className="glass-mac-wallpaper__mesh glass-mac-wallpaper__mesh--front">
        <span className="glass-mac-wallpaper__blob glass-mac-wallpaper__blob--c" />
        <span className="glass-mac-wallpaper__blob glass-mac-wallpaper__blob--f" />
        <span className="glass-mac-wallpaper__blob glass-mac-wallpaper__blob--g" />
      </div>
      <div className="glass-mac-wallpaper__shine" />
      <div className="glass-mac-wallpaper__grain" />
      <div className="glass-mac-wallpaper__vignette" />
    </div>
  );
}
