import "./overlayGlassFrame.css";

interface OverlayGlassFrameProps {
  className?: string;
}

/** Desktop overlay screen-edge frame + L-bracket corners. */
export function OverlayGlassFrame({ className }: OverlayGlassFrameProps): JSX.Element {
  return (
    <div
      className={["overlay-glass-border", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <span className="overlay-glass-border__corner overlay-glass-border__corner--tl" />
      <span className="overlay-glass-border__corner overlay-glass-border__corner--tr" />
      <span className="overlay-glass-border__corner overlay-glass-border__corner--bl" />
      <span className="overlay-glass-border__corner overlay-glass-border__corner--br" />
    </div>
  );
}
