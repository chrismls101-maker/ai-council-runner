import { useCallback, useEffect, useState } from "react";
import { lensContextHostname } from "../../shared/glassLensContext.ts";

export type GlassLensPageState = {
  url: string;
  title: string;
  text: string;
};

export type GlassLensPanelProps = {
  page: GlassLensPageState;
  screenshot: string;
  pageLoading?: boolean;
  screenshotLoading?: boolean;
  onTakeScreenshot: () => void;
  onAskAboutPage: () => void;
  onAskAboutScreenshot: () => void;
  onDismiss: () => void;
};

/**
 * IIVO Lens panel — slides up above the command bar composer (accessory strip).
 */
export function GlassLensPanel({
  page,
  screenshot,
  pageLoading = false,
  screenshotLoading = false,
  onTakeScreenshot,
  onAskAboutPage,
  onAskAboutScreenshot,
  onDismiss,
}: GlassLensPanelProps): JSX.Element {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const hostname = lensContextHostname(page.url);
  const title = page.title.trim() || hostname;
  const hasScreenshot = Boolean(screenshot.trim());
  const busy = pageLoading || screenshotLoading;

  const openLightbox = useCallback(() => {
    if (!hasScreenshot) return;
    setLightboxOpen(true);
  }, [hasScreenshot]);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  useEffect(() => {
    if (!hasScreenshot) setLightboxOpen(false);
  }, [hasScreenshot]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, closeLightbox]);

  return (
    <>
      <div className="glass-lens-panel" data-testid="glass-lens-panel">
        <div className="glass-lens-panel__head">
          <div className="glass-lens-panel__head-title">
            <span className="glass-lens-panel__section-label">
              <span className="glass-lens-panel__section-icon" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2l1.4 4.3L18 7.8l-4.3 1.4L12 13.5 10.3 9.2 6 7.8l4.6-1.5L12 2Z"
                    fill="currentColor"
                    opacity="0.9"
                  />
                  <path
                    d="M5 14l.8 2.4L8.2 17l-2.4.8L5 20.2l-.8-2.4L1.8 17l2.4-.8L5 14Z"
                    fill="currentColor"
                    opacity="0.55"
                  />
                </svg>
              </span>
              Page Intelligence
            </span>
            <span className="ui-led-line glass-lens-panel__section-led" aria-hidden="true" />
          </div>
          <span className="glass-lens-panel__live-pill">
            <span className="glass-lens-panel__live-dot" aria-hidden="true" />
            Live context
          </span>
          <button
            type="button"
            className="glass-lens-panel__close"
            data-testid="glass-lens-panel-close"
            aria-label="Close Lens panel"
            onClick={onDismiss}
          >
            ×
          </button>
        </div>

        <div className="glass-lens-panel__domain-row">
          <svg
            className="glass-lens-panel__globe"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.35" />
            <ellipse cx="12" cy="12" rx="3.8" ry="9" stroke="currentColor" strokeWidth="1.15" />
            <path d="M3 12h18" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
          </svg>
          <span
            className="glass-lens-panel__domain"
            data-testid="glass-lens-panel-domain"
            title={page.url.trim() || hostname}
          >
            {hostname}
          </span>
          <svg
            className="glass-lens-panel__verified"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" fill="rgba(114, 168, 255, 0.85)" />
            <path
              d="m7.5 12.2 2.4 2.4 6.6-6.8"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="glass-lens-panel__title" data-testid="glass-lens-panel-title" title={title}>
          {title}
        </h2>

        {hasScreenshot ? (
          <button
            type="button"
            className="glass-lens-panel__preview-wrap"
            data-testid="glass-lens-panel-screenshot"
            aria-label="Open screenshot preview"
            onClick={openLightbox}
          >
            <img
              className="glass-lens-panel__preview"
              src={screenshot}
              alt="Screenshot preview"
            />
          </button>
        ) : (
          <div
            className="glass-lens-panel__preview-empty"
            data-testid="glass-lens-panel-preview-empty"
            aria-hidden="true"
          >
            No screenshot yet
          </div>
        )}

        <div className="glass-lens-panel__pills">
          {!hasScreenshot ? (
            <>
              <button
                type="button"
                className="glass-lens-panel__pill"
                data-testid={
                  screenshotLoading ? "glass-lens-panel-screenshot-loading" : "glass-lens-panel-take-screenshot"
                }
                disabled={busy}
                onClick={onTakeScreenshot}
              >
                {screenshotLoading ? "Capturing…" : "Take Screenshot"}
              </button>
              <button
                type="button"
                className="glass-lens-panel__pill glass-lens-panel__pill--primary"
                data-testid="glass-lens-panel-ask-page-no-screenshot"
                disabled={busy}
                onClick={onAskAboutPage}
              >
                Ask about this page
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="glass-lens-panel__pill glass-lens-panel__pill--primary"
                data-testid="glass-lens-panel-ask-screenshot"
                disabled={busy}
                onClick={onAskAboutScreenshot}
              >
                Ask about Screenshot
              </button>
              <button
                type="button"
                className="glass-lens-panel__pill"
                data-testid="glass-lens-panel-ask-page-with-screenshot"
                disabled={busy}
                onClick={onAskAboutPage}
              >
                Ask about this page
              </button>
            </>
          )}
        </div>
      </div>

      {lightboxOpen ? (
        <div
          className="glass-lens-lightbox"
          data-testid="glass-lens-panel-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot preview"
        >
          <button
            type="button"
            className="glass-lens-lightbox__backdrop"
            aria-label="Close screenshot preview"
            onClick={closeLightbox}
          />
          <figure className="glass-lens-lightbox__figure">
            <img className="glass-lens-lightbox__img" src={screenshot} alt="Full screenshot preview" />
          </figure>
          <button
            type="button"
            className="glass-lens-lightbox__close"
            data-testid="glass-lens-panel-lightbox-close"
            aria-label="Close"
            onClick={closeLightbox}
          >
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
