import { type JSX } from "react";
import {
  formatGlassBrowseSocialProof,
  useGlassBrowseSocialProof,
} from "../../hooks/useGlassBrowseSocialProof";
import { useGlassBrowse } from "./glassBrowseMode";

function EnterPreviewMock(): JSX.Element {
  return (
    <div className="glass-browse-enter__preview" aria-hidden="true">
      <div className="glass-browse-enter__preview-page">
        <div className="glass-browse-enter__preview-page-chrome">
          <span />
          <span />
          <span />
        </div>
        <div className="glass-browse-enter__preview-page-lines">
          <span />
          <span />
        </div>
      </div>
      <div className="glass-browse-enter__preview-glass">
        <div className="glass-browse-enter__preview-command" />
        <div className="glass-browse-enter__preview-strip">
          <span />
          <span className="glass-browse-enter__preview-strip-aletheia" />
        </div>
      </div>
      <span className="glass-browse-enter__preview-live">
        <span className="glass-browse-enter__preview-live-dot" />
        Live
      </span>
    </div>
  );
}

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
        className={`glass-browse-enter__card${engaged ? " glass-browse-enter__card--engaged" : ""}`}
        onClick={enter}
        disabled={engaged}
        data-testid="glass-browse-enter"
        aria-label="Enter live Glass overlay demo on this page"
      >
        <EnterPreviewMock />

        <div className="glass-browse-enter__content">
          <div className="glass-browse-enter__copy">
            <span className="glass-browse-enter__eyebrow">Try it — no install</span>
            <h3 className="glass-browse-enter__title">Experience the next layer</h3>
            <p className="glass-browse-enter__lead">
              Real Glass above this page — scroll iivo.ai beneath the command bar and builder strip.
            </p>
          </div>

          <span className="glass-browse-enter__cta">
            Enter live Glass
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M13 5l7 7-7 7v-4H4v-6h9V5z" />
            </svg>
          </span>
        </div>

        {socialLabel ? (
          <span className="glass-browse-enter__social">{socialLabel} tried it on this page</span>
        ) : null}
      </button>
    </div>
  );
}
