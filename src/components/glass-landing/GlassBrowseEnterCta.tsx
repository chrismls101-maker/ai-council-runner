import { useState, type JSX } from "react";
import GlassDesktopFrameMock from "./GlassDesktopFrameMock";
import { trackGlassBrowseEvent } from "../../utils/glassBrowseAnalytics";
import {
  formatGlassBrowseSocialProof,
  useGlassBrowseSocialProof,
} from "../../hooks/useGlassBrowseSocialProof";
import { useGlassBrowse } from "./glassBrowseMode";

export default function GlassBrowseEnterCta(): JSX.Element | null {
  const { enter } = useGlassBrowse();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { entered, demoEnabled } = useGlassBrowseSocialProof();
  const socialLabel = formatGlassBrowseSocialProof(entered);

  if (!demoEnabled) return null;

  const onEnter = (): void => {
    const isDesktop = window.matchMedia("(min-width: 900px)").matches;
    if (isDesktop) {
      enter();
      return;
    }
    trackGlassBrowseEvent("mobile_preview");
    setMobileOpen(true);
  };

  return (
    <>
      <div className="glass-browse-enter">
        <button
          type="button"
          className="glass-browse-enter__btn gl-surface"
          onClick={onEnter}
          data-testid="glass-browse-enter"
        >
          <span className="glass-browse-enter__ring">G</span>
          <span className="glass-browse-enter__copy">
            <strong>View this page through Glass</strong>
            <span>
              Scroll the site beneath a live overlay — same chrome as the Mac app
              {socialLabel ? ` · ${socialLabel}` : ""}
            </span>
          </span>
        </button>
      </div>

      {mobileOpen ? (
        <div className="glass-browse-mobile" role="dialog" aria-modal="true" aria-label="Glass preview">
          <button
            type="button"
            className="glass-browse-mobile__backdrop"
            aria-label="Close"
            onClick={() => setMobileOpen(false)}
          />
          <div className="glass-browse-mobile__panel gl-surface">
            <p className="glass-browse-mobile__title">Glass view is desktop-first</p>
            <p className="glass-browse-mobile__body">
              On a Mac, Glass locks the command bar and builder strip while the page scrolls underneath.
              Here is how it looks on your desktop.
            </p>
            <GlassDesktopFrameMock />
            <button type="button" className="gl-btn gl-btn--primary glass-browse-mobile__close" onClick={() => setMobileOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
