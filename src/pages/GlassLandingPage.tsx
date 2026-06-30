import type { JSX } from "react";
import { useEffect } from "react";
import GlassBrowseEnterCta from "../components/glass-landing/GlassBrowseEnterCta";
import GlassBrowseOverlay from "../components/glass-landing/GlassBrowseOverlay";
import { GlassBrowseProvider, useGlassBrowseOptional } from "../components/glass-landing/glassBrowseMode";
import GlassCinematicIntro, {
  GlassCinematicIntroProvider,
  useGlassCinematicIntro,
} from "../components/glass-landing/glassCinematicIntro";
import GlassLandingBody from "../components/glass-landing/GlassLandingBody";
import GlassLandingSiteDock from "../components/glass-landing/GlassLandingSiteDock";
import GlassLandingNav from "../components/glass-landing/GlassLandingNav";
import { RevealSection } from "../components/glass-landing/RevealSection";
import GlassSiteHero from "../components/glass-landing/GlassSiteHero";
import { useSmoothScroll } from "../components/glass-landing/useSmoothScroll";
import "../components/glass-landing/glass-landing.css";
import "../components/glass-landing/glass-landing-desktop.css";
import "../components/glass-landing/glass-landing-site.css";
import "../components/glass-landing/glass-landing-mocks.css";
import "../components/glass-landing/glass-browse-mode.css";
import "../components/glass-landing/glass-cinematic-intro.css";
import "../components/glass-landing/glass-landing-site-dock.css";
import "../components/glass-landing/glass-landing-elite.css";
import "../components/glass-landing/glass-landing-body.css";
import { GLASS_DMG_ARM64_DOWNLOAD_URL, GLASS_DMG_X64_DOWNLOAD_URL } from "../utils/glassRelease";
import { trackGlassBrowsePageViewOnce } from "../utils/glassBrowseAnalytics";

function DownloadCta({
  installTestId,
  downloadTestId,
  compact = false,
  hero = false,
  footer = false,
}: {
  installTestId?: string;
  downloadTestId?: string;
  compact?: boolean;
  hero?: boolean;
  footer?: boolean;
}) {
  if (footer) {
    return (
      <div className="glass-landing__final-cta">
        <div className="glass-landing__final-actions">
          <a
            href={GLASS_DMG_ARM64_DOWNLOAD_URL}
            className="glass-cup-btn glass-cup-btn--primary glass-landing__final-btn"
            data-testid={downloadTestId}
          >
            <span className="glass-cup-btn__label">Download · Apple Silicon</span>
          </a>
          <a
            href={GLASS_DMG_X64_DOWNLOAD_URL}
            className="glass-cup-btn glass-cup-btn--ghost glass-landing__final-btn"
            data-testid={downloadTestId ? `${downloadTestId}-x64` : undefined}
          >
            <span className="glass-cup-btn__label">Download · Intel</span>
          </a>
          <a
            href="/install"
            className="glass-cup-btn glass-cup-btn--ghost glass-landing__final-btn glass-landing__final-btn--guide"
            data-testid={installTestId}
          >
            <span className="glass-cup-btn__label">Installation guide</span>
          </a>
        </div>
        <div className="glass-landing__chips glass-landing__chips--final">
          <span className="glass-landing__chip">macOS 14+</span>
          <span className="glass-landing__chip">Free beta</span>
          <span className="glass-landing__chip">No account required</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "glass-landing__download-panel",
        hero ? "glass-landing__download-panel--hero" : "gl-surface",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!compact ? <p className="glass-landing__download-title">Download for Mac</p> : null}
      <div className="glass-landing__download-actions">
        <a
          href={GLASS_DMG_ARM64_DOWNLOAD_URL}
          className="glass-cup-btn glass-cup-btn--primary"
          data-testid={downloadTestId}
        >
          <span className="glass-cup-btn__label">Apple Silicon (2020 and later)</span>
        </a>
        <a
          href={GLASS_DMG_X64_DOWNLOAD_URL}
          className="glass-cup-btn glass-cup-btn--ghost"
          data-testid={downloadTestId ? `${downloadTestId}-x64` : undefined}
        >
          <span className="glass-cup-btn__label">Intel (2019 and earlier)</span>
        </a>
      </div>
      <a href="/install" className="glass-landing__install-link" data-testid={installTestId}>
        Installation guide →
      </a>
      <div className="glass-landing__chips">
        <span className="glass-landing__chip">macOS 14+</span>
        <span className="glass-landing__chip">Free beta</span>
        <span className="glass-landing__chip">No account required</span>
      </div>
    </div>
  );
}

export default function GlassLandingPage() {
  return (
    <GlassBrowseProvider>
      <GlassLandingPageWithIntro />
    </GlassBrowseProvider>
  );
}

function GlassLandingPageWithIntro(): JSX.Element {
  return (
    <GlassCinematicIntroProvider
      onComplete={() => {
        document.documentElement.classList.add("glass-chrome-settling");
        window.setTimeout(() => {
          document.documentElement.classList.remove("glass-chrome-settling");
          document.documentElement.classList.add("glass-intro-finished");
        }, 950);
      }}
    >
      <GlassLandingPageContent />
    </GlassCinematicIntroProvider>
  );
}

function introPhaseClass(phase: string, enabled: boolean, complete: boolean): string {
  if (!enabled || complete) return "glass-landing--intro-complete";
  if (phase === "boot") return "glass-landing--intro-boot";
  if (phase === "word-cinema") return "glass-landing--intro-word-cinema";
  return `glass-landing--intro-${phase}`;
}

function GlassLandingPageContent(): JSX.Element {
  const browse = useGlassBrowseOptional();
  const browsePresent = (browse?.active || browse?.exiting) ?? false;
  const intro = useGlassCinematicIntro();

  useSmoothScroll(intro.heroCinemaComplete && !browsePresent);

  useEffect(() => {
    trackGlassBrowsePageViewOnce();
  }, []);

  return (
    <div
      className={[
        "glass-landing",
        browsePresent ? "glass-landing--browse-active" : "",
        introPhaseClass(intro.phase, intro.enabled, intro.complete),
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="glass-public-landing"
    >
      <GlassLandingNav />
      <GlassBrowseOverlay />
      <GlassCinematicIntro />
      <GlassLandingSiteDock />

      <div className="glass-landing__shell" data-testid="glass-landing-shell">
        <main className="glass-landing__content">
          <RevealSection
            id="hero"
            data-glass-section="hero"
            data-glass-scroll-zone
            className="glass-landing__section glass-landing__section--hero"
            immediate
          >
            <GlassSiteHero
              cta={
                <>
                  <GlassBrowseEnterCta />
                  <DownloadCta
                    hero
                    installTestId="glass-landing-install-link"
                    downloadTestId="glass-landing-download"
                  />
                </>
              }
            />
          </RevealSection>

          <GlassLandingBody
            downloadCta={
              <DownloadCta
                footer
                downloadTestId="glass-landing-download-final"
                installTestId="glass-landing-install-link"
              />
            }
          />
        </main>
      </div>
    </div>
  );
}
