/**
 * Full-screen loading HUD glass — extension .iivo-glass-shell material,
 * tint shifted to black / smoky navy. No eye, text, or chrome content.
 */
import "./loadingGlassBackground.css";

export function LoadingGlassBackground(): JSX.Element {
  return (
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
      <span
        className="loading-glass-background__corner loading-glass-background__corner--tl"
        aria-hidden="true"
      />
      <span
        className="loading-glass-background__corner loading-glass-background__corner--tr"
        aria-hidden="true"
      />
      <span
        className="loading-glass-background__corner loading-glass-background__corner--bl"
        aria-hidden="true"
      />
      <span
        className="loading-glass-background__corner loading-glass-background__corner--br"
        aria-hidden="true"
      />
    </div>
  );
}
