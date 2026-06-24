import { OverlayGlassFrame } from "../shared/OverlayGlassFrame.tsx";
import "./loadingGlassBackground.css";

/**
 * Full-screen loading HUD glass — frosted workspace shell (Research / agents).
 * Border + brackets match desktop overlay. Dark HUD: add --dark class on root div.
 */
export function LoadingGlassBackground(): JSX.Element {
  return (
    <>
      <div className="loading-glass-background" role="presentation" aria-label="Loading glass background">
        <span className="loading-glass-background__sheen" aria-hidden="true" />
        <span
          className="loading-glass-background__streak loading-glass-background__streak--a"
          aria-hidden="true"
        />
        <span
          className="loading-glass-background__streak loading-glass-background__streak--b"
          aria-hidden="true"
        />
      </div>
      <OverlayGlassFrame className="loading-glass-background__frame" />
    </>
  );
}
