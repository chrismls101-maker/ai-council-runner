import { type JSX } from "react";
import {
  formatGlassBrowseSocialProof,
  useGlassBrowseSocialProof,
} from "../../hooks/useGlassBrowseSocialProof";
import { useGlassBrowse } from "./glassBrowseMode";

export default function GlassBrowseEnterCta(): JSX.Element | null {
  const { enter, active, exiting } = useGlassBrowse();
  const { entered, demoEnabled, loading } = useGlassBrowseSocialProof();
  const socialLabel = formatGlassBrowseSocialProof(entered);
  const engaged = active || exiting;

  if (!demoEnabled || loading) return null;

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
