import { useEffect, useRef, type JSX } from "react";
import {
  formatGlassBrowseSocialProof,
  useGlassBrowseSocialProof,
} from "../../hooks/useGlassBrowseSocialProof";
import { useGlassBrowse } from "./glassBrowseMode";
import { useGlassCinematicIntro } from "./glassCinematicIntro";

const AUTO_ENTER_MS = 1500;

export default function GlassBrowseEnterCta(): JSX.Element | null {
  const { enter, active, exiting } = useGlassBrowse();
  const intro = useGlassCinematicIntro();
  const { entered, demoEnabled, loading } = useGlassBrowseSocialProof();
  const socialLabel = formatGlassBrowseSocialProof(entered);
  const engaged = active || exiting;
  const autoEnterAttempted = useRef(false);

  useEffect(() => {
    if (!demoEnabled || loading || engaged || autoEnterAttempted.current) return;
    if (intro.enabled && !intro.complete) return;
    const timer = window.setTimeout(() => {
      autoEnterAttempted.current = true;
      enter();
    }, AUTO_ENTER_MS);
    return () => window.clearTimeout(timer);
  }, [demoEnabled, loading, engaged, enter, intro.enabled, intro.complete]);

  if (!demoEnabled) return null;

  return (
    <div className={`glass-browse-enter${engaged ? " glass-browse-enter--engaged" : ""}`}>
      <button
        type="button"
        className={`glass-browse-enter__btn gl-surface${engaged ? " glass-browse-enter__btn--engaged" : ""}`}
        onClick={enter}
        disabled={engaged}
        data-testid="glass-browse-enter"
      >
        <span className="glass-browse-enter__ring">G</span>
        <span className="glass-browse-enter__copy">
          <strong>Experience the next layer</strong>
          <span>
            Live intelligent Glass over this page — scroll the site beneath, overlay stays locked
            {socialLabel ? ` · ${socialLabel}` : ""}
          </span>
        </span>
      </button>
    </div>
  );
}
