import type { JSX, ReactNode } from "react";
import { useGlassCinematicIntro } from "./glassCinematicIntro";

const SITE_PHASES = new Set(["ide-zoom", "site-reveal", "glass-site", "complete"]);
const SAFARI_CHROME_PHASES = new Set(["safari-open", "safari-typing", "safari-load"]);
const IDE_HANDOFF_PHASES = new Set(["ide-zoom", "site-reveal"]);

/** Centered Safari window chrome wrapping the landing page as "the site". */
export default function GlassSafariWindow({ children }: { children: ReactNode }): JSX.Element {
  const intro = useGlassCinematicIntro();
  const ideHandoff = intro.enabled && !intro.complete && IDE_HANDOFF_PHASES.has(intro.phase);
  const safariChrome = intro.enabled && !intro.complete && SAFARI_CHROME_PHASES.has(intro.phase);
  const safariVisible = !intro.enabled || intro.complete || safariChrome || ideHandoff || SITE_PHASES.has(intro.phase);
  const showSite = !intro.enabled || intro.complete || SITE_PHASES.has(intro.phase);
  const loading = intro.enabled && intro.phase === "safari-load";
  const typing = intro.enabled && intro.phase === "safari-typing";
  const urlDisplay = intro.enabled && !intro.complete ? intro.typedUrl || "Search or enter website name" : "iivo.ai";
  const urlIsPlaceholder = intro.enabled && !intro.complete && !intro.typedUrl && intro.phase !== "safari-load";
  const showLock = !urlIsPlaceholder && (intro.typedUrl.length > 0 || intro.phase === "safari-load");

  return (
    <div
      className={[
        "glass-landing__safari",
        safariVisible ? "glass-landing__safari--intro-visible" : "",
        ideHandoff ? "glass-landing__safari--ide-handoff" : "",
        loading ? "glass-landing__safari--loading" : "",
        typing ? "glass-landing__safari--typing" : "",
        showSite ? "glass-landing__safari--site-ready" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="glass-safari-window"
    >
      <div className="glass-landing__safari-chrome">
        <div className="glass-landing__safari-toolbar">
          <div className="glass-landing__safari-lights" aria-hidden="true">
            <span className="glass-landing__safari-dot glass-landing__safari-dot--red" />
            <span className="glass-landing__safari-dot glass-landing__safari-dot--amber" />
            <span className="glass-landing__safari-dot glass-landing__safari-dot--green" />
          </div>
          <div className="glass-landing__safari-nav" aria-hidden="true">
            <span className="glass-landing__safari-nav-btn glass-landing__safari-nav-btn--back" />
            <span className="glass-landing__safari-nav-btn glass-landing__safari-nav-btn--fwd" />
          </div>
          <div className={`glass-landing__safari-url${urlIsPlaceholder ? " glass-landing__safari-url--placeholder" : ""}`}>
            {!urlIsPlaceholder && showLock ? (
              <span className="glass-landing__safari-lock" aria-hidden="true" />
            ) : null}
            <span className="glass-landing__safari-domain">{urlDisplay}</span>
            {showSite && intro.complete ? (
              <span className="glass-landing__safari-path">/glass</span>
            ) : null}
            {typing ? <span className="glass-landing__safari-caret" aria-hidden="true" /> : null}
          </div>
          <div className="glass-landing__safari-actions" aria-hidden="true">
            <span className="glass-landing__safari-action" />
            <span className="glass-landing__safari-action" />
          </div>
        </div>
      </div>
      <div className="glass-landing__safari-content">
        {loading ? (
          <div className="glass-landing__safari-loader" aria-hidden="true">
            <span className="glass-landing__safari-loader-spin" />
            <span>Loading iivo.ai…</span>
          </div>
        ) : null}
        <div className={`glass-landing__safari-page${showSite ? " glass-landing__safari-page--visible" : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
