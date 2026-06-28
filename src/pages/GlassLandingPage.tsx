import type { CSSProperties, JSX } from "react";
import { useEffect } from "react";
import AmbientOsStack from "../components/glass-landing/AmbientOsStack";
import GlassBrowseEnterCta from "../components/glass-landing/GlassBrowseEnterCta";
import GlassBrowseOverlay from "../components/glass-landing/GlassBrowseOverlay";
import { GlassBrowseProvider, useGlassBrowse, useGlassBrowseOptional } from "../components/glass-landing/glassBrowseMode";
import GlassCinematicIntro, {
  GlassCinematicIntroProvider,
  useGlassCinematicIntro,
} from "../components/glass-landing/glassCinematicIntro";
import GlassIntroSceneWindows from "../components/glass-landing/GlassIntroSceneWindows";
import GlassLandingDesktopBackdrop from "../components/glass-landing/GlassLandingDesktopBackdrop";
import GlassSafariWindow from "../components/glass-landing/GlassSafariWindow";
import GlassSiteHero from "../components/glass-landing/GlassSiteHero";
import GlassLandingFooter from "../components/glass-landing/GlassLandingFooter";
import GlassLandingSiteDock from "../components/glass-landing/GlassLandingSiteDock";
import GlassLandingNav from "../components/glass-landing/GlassLandingNav";
import GlassTerminalWelcomeMock from "../components/glass-landing/GlassTerminalWelcomeMock";
import { RevealSection } from "../components/glass-landing/RevealSection";
import "../components/glass-landing/glass-landing.css";
import "../components/glass-landing/glass-landing-desktop.css";
import "../components/glass-landing/glass-landing-site.css";
import "../components/glass-landing/glass-landing-mocks.css";
import "../components/glass-landing/glass-browse-mode.css";
import "../components/glass-landing/glass-cinematic-intro.css";
import "../components/glass-landing/glass-landing-site-dock.css";
import { GLASS_DMG_ARM64_DOWNLOAD_URL, GLASS_DMG_X64_DOWNLOAD_URL } from "../utils/glassRelease";
import { trackGlassBrowsePageViewOnce } from "../utils/glassBrowseAnalytics";

const PILLARS = [
  {
    label: "Ambient",
    title: "Intelligence without interruption",
    copy: (
      <>
        Glass doesn&apos;t replace your apps — it reads them. Every window, every tab, from one transparent
        layer that listens and acts only when <span className="glass-landing__your">YOU</span> allow it.
      </>
    ),
  },
  {
    label: "Builder",
    title: "Ship without switching",
    copy: (
      <>
        Terminal, agents, and powers menu turn live context into code, deploys, and diffs — without the
        alt-tab tax that kills every other AI tool.
      </>
    ),
  },
  {
    label: "AI-native",
    title: "Born OS-level. Not browser-bolted.",
    copy: (
      <>
        Council routing, Lens fusion, and session memory are architecture — not a sidebar glued onto Chrome.
        This is what AI-native actually means.
      </>
    ),
  },
  {
    label: "Operating system",
    title: "The layer your competitors don't have",
    copy: (
      <>
        Command bar, builder strip, and glass frame work as one system — persistent above macOS, invisible
        until <span className="glass-landing__your">YOU</span> need it. Always on top. Always{" "}
        <span className="glass-landing__your">YOURS</span>.
      </>
    ),
  },
] as const;

const TRUST_LINES = [
  <>Glass sees and hears what <span className="glass-landing__your">YOU</span> allow — nothing more.</>,
  <>Screen capture activates only when <span className="glass-landing__your">YOU</span> trigger it.</>,
  <>Audio recording starts when <span className="glass-landing__your">YOU</span> start it and stops when <span className="glass-landing__your">YOU</span> stop it.</>,
  <>
    <span className="glass-landing__your">YOUR</span> council runs are processed on our server and not stored
    beyond <span className="glass-landing__your">YOUR</span> session unless{" "}
    <span className="glass-landing__your">YOU</span> save them.
  </>,
  <>
    <span className="glass-landing__your">YOUR</span> memory is{" "}
    <span className="glass-landing__your">YOURS</span>.{" "}
    <span className="glass-landing__your">YOU</span> can delete it at any time, completely.
  </>,
  <>
    We will never sell <span className="glass-landing__your">YOUR</span> data. We will never train on{" "}
    <span className="glass-landing__your">YOUR</span> private sessions without{" "}
    <span className="glass-landing__your">YOUR</span> explicit consent.
  </>,
];

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
            className="gl-btn gl-btn--primary glass-landing__final-btn"
            data-testid={downloadTestId}
          >
            Download · Apple Silicon
          </a>
          <a
            href={GLASS_DMG_X64_DOWNLOAD_URL}
            className="gl-btn gl-btn--ghost glass-landing__final-btn"
            data-testid={downloadTestId ? `${downloadTestId}-x64` : undefined}
          >
            Download · Intel
          </a>
          <a
            href="/install"
            className="gl-btn gl-btn--ghost glass-landing__final-btn glass-landing__final-btn--guide"
            data-testid={installTestId}
          >
            Installation guide
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
          className="gl-btn gl-btn--primary"
          data-testid={downloadTestId}
        >
          Apple Silicon (2020 and later)
        </a>
        <a
          href={GLASS_DMG_X64_DOWNLOAD_URL}
          className="gl-btn gl-btn--ghost"
          data-testid={downloadTestId ? `${downloadTestId}-x64` : undefined}
        >
          Intel (2019 and earlier)
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
  const { enter } = useGlassBrowse();

  return (
    <GlassCinematicIntroProvider
      onGlassActivate={() => enter()}
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
  return `glass-landing--intro-${phase}`;
}

function GlassLandingPageContent(): JSX.Element {
  const browse = useGlassBrowseOptional();
  const browsePresent = (browse?.active || browse?.exiting) ?? false;
  const intro = useGlassCinematicIntro();

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
      <GlassLandingDesktopBackdrop />
      <GlassIntroSceneWindows phase={intro.phase} />
      <GlassLandingNav />
      <GlassBrowseOverlay />
      <GlassCinematicIntro />
      <GlassLandingSiteDock />

      <GlassSafariWindow>
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

      <RevealSection
        id="ambient-os"
        data-glass-section="ambient-os"
        data-glass-scroll-zone
        className="glass-landing__section glass-landing__section--split glass-landing__section--panel"
      >
        <div className="glass-landing__split-copy glass-landing__panel gl-reveal-child">
          <p className="glass-landing__section-kicker">The category shift</p>
          <h2 className="glass-landing__section-title">
            Every app gets intelligence. Glass is the layer that delivers it.
          </h2>
          <p className="glass-landing__section-body">
            Copilots ship inside one app at a time. Chat tools wait for you to paste. IIVO Glass is the
            ambient operating layer — one command surface, cross-window Lens, multi-agent council, and
            memory that follows you from Safari to Terminal to Figma. Not inside your apps. Above all of
            them.
          </p>
          <ul className="glass-landing__compare">
            <li className="glass-landing__compare-item gl-surface glass-landing__compare-item--muted">
              <span className="glass-landing__compare-label">Tab AI</span>
              One window · paste context · amnesia between sessions
            </li>
            <li className="glass-landing__compare-item gl-surface glass-landing__compare-item--accent">
              <span className="glass-landing__compare-label">Intelligent Glass</span>
              Every app · fused context · always above, never inside
            </li>
          </ul>
        </div>
        <div className="glass-landing__split-visual glass-landing__panel glass-landing__panel--subtle gl-reveal-child">
          <AmbientOsStack />
        </div>
      </RevealSection>

      <RevealSection
        id="builder-stack"
        data-glass-section="builder-stack"
        className="glass-landing__section glass-landing__section--features glass-landing__section--panel"
      >
        <div className="glass-landing__features-shell glass-landing__panel">
        <div className="glass-landing__features-header gl-reveal-child">
          <p className="glass-landing__section-kicker">Why Glass wins</p>
          <h2 className="glass-landing__section-title glass-landing__section-title--wide">
            Four pillars. One intelligence layer above everything.
          </h2>
        </div>
        <div className="glass-landing__features-grid">
          <div className="glass-landing__features-demo gl-reveal-child">
            <GlassTerminalWelcomeMock />
          </div>
          <div className="glass-landing__features-stack">
            {PILLARS.map(({ label, title, copy }, index) => (
              <article
                key={label}
                className="glass-landing__feature-card gl-surface gl-reveal-child"
                style={{ "--stagger": index } as CSSProperties}
              >
                <span className="glass-landing__card-label">{label}</span>
                <p className="glass-landing__card-title">{title}</p>
                <p className="glass-landing__card-text">{copy}</p>
              </article>
            ))}
          </div>
        </div>
        </div>
      </RevealSection>

      <RevealSection className="glass-landing__section glass-landing__section--quote glass-landing__section--panel">
        <blockquote className="glass-landing__quote glass-landing__panel gl-reveal-child">
          <p>
            “Platforms want you inside their tab. Glass puts{" "}
            <span className="glass-landing__your">YOU</span> above all of them.”
          </p>
        </blockquote>
      </RevealSection>

      <RevealSection id="trust" className="glass-landing__section glass-landing__section--panel">
        <div className="glass-landing__trust-shell glass-landing__panel gl-reveal-child">
        <div>
          <p className="glass-landing__section-kicker">Privacy by design</p>
          <h2 className="glass-landing__section-title">
            Built to earn <span className="glass-landing__your">YOUR</span> trust. Not assume it.
          </h2>
        </div>
        <div className="glass-landing__trust-panel gl-reveal-child">
          <div className="glass-landing__trust-lines">
            {TRUST_LINES.map((line, index) => (
              <p key={index} className="glass-landing__trust-line">
                {line}
              </p>
            ))}
          </div>
          <p className="glass-landing__trust-close">
            IIVO Glass works for <span className="glass-landing__your">YOU</span> — above every app. Not a
            platform that traps <span className="glass-landing__your">YOU</span> inside theirs.
          </p>
        </div>
        </div>
      </RevealSection>

      <RevealSection className="glass-landing__section glass-landing__final glass-landing__section--panel">
        <div className="glass-landing__final-band glass-landing__panel glass-landing__panel--emphasis gl-reveal-child">
          <p className="glass-landing__final-kicker gl-surface-pill">The next layer is live</p>
          <h2 className="glass-landing__final-title">
            Install intelligent
            <br />
            Glass.
          </h2>
          <p className="glass-landing__final-lead">
            One download. One overlay. Every window on your Mac — finally connected under the same
            intelligence layer.
          </p>
          <DownloadCta footer downloadTestId="glass-landing-download-final" installTestId="glass-landing-install-link" />
          <span className="glass-landing__final-led" aria-hidden="true" />
        </div>
      </RevealSection>

      <GlassLandingFooter />
      </main>
      </GlassSafariWindow>
    </div>
  );
}
