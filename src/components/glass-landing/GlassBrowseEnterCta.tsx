import type { JSX } from "react";
import {
  formatGlassBrowseSocialProof,
  useGlassBrowseSocialProof,
} from "../../hooks/useGlassBrowseSocialProof";
import { useGlassBrowse } from "./glassBrowseMode";

export default function GlassBrowseEnterCta(): JSX.Element | null {
  const { enter } = useGlassBrowse();
  const { entered, demoEnabled } = useGlassBrowseSocialProof();
  const socialLabel = formatGlassBrowseSocialProof(entered);

  if (!demoEnabled) return null;

  return (
    <div className="glass-browse-enter">
      <button
        type="button"
        className="glass-browse-enter__btn gl-surface"
        onClick={enter}
        data-testid="glass-browse-enter"
      >
        <span className="glass-browse-enter__ring">G</span>
        <span className="glass-browse-enter__copy">
          <strong>View this page through Glass</strong>
          <span>
            Scroll the site beneath a live overlay — sized for your screen
            {socialLabel ? ` · ${socialLabel}` : ""}
          </span>
        </span>
      </button>
    </div>
  );
}
