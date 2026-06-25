import type { CSSProperties, JSX } from "react";
import { useEffect } from "react";
import AmbientOsStack from "../components/glass-landing/AmbientOsStack";
import GlassBrowseEnterCta from "../components/glass-landing/GlassBrowseEnterCta";
import GlassBrowseOverlay from "../components/glass-landing/GlassBrowseOverlay";
import { GlassBrowseProvider, useGlassBrowseOptional } from "../components/glass-landing/glassBrowseMode";
import GlassDesktopFrameMock from "../components/glass-landing/GlassDesktopFrameMock";
import GlassLandingFooter from "../components/glass-landing/GlassLandingFooter";
import GlassLandingNav from "../components/glass-landing/GlassLandingNav";
import GlassTerminalWelcomeMock from "../components/glass-landing/GlassTerminalWelcomeMock";
import { RevealSection } from "../components/glass-landing/RevealSection";
import "../components/glass-landing/glass-landing.css";
import "../components/glass-landing/glass-landing-mocks.css";
import "../components/glass-landing/glass-browse-mode.css";
import { GLASS_DMG_ARM64_DOWNLOAD_URL, GLASS_DMG_X64_DOWNLOAD_URL } from "../utils/glassRelease";
import { trackGlassBrowsePageViewOnce } from "../utils/glassBrowseAnalytics";

const PILLARS = [
  {
    label: "Ambient",
    title: "Present without interrupting",
    copy: (
      <>
        Glass floats above <span className="glass-landing__your">YOUR</span> desktop — listening, watching,
        and translating only when <span className="glass-landing__your">YOU</span> allow it.
      </>
    ),
  },
  {
    label: "Builder",
    title: "Ship from the overlay",
    copy: (
      <>
        Agents, terminal, and powers menu turn context into code, plans, and automation — without leaving
        the app <span className="glass-landing__your">YOU</span> are in.
      </>
    ),
  },
  {
    label: "AI-native",
    title: "Orchestration, not a chatbox",
    copy: (
      <>
        Multi-agent council, memory, and tool routing are built into the OS layer — not bolted onto a
        browser tab.
      </>
    ),
  },
  {
    label: "Operating system",
    title: "A layer above your Mac",
    copy: (
      <>
        Command bar, dock, builder strip, and panels work as one system — always on top, always under{" "}
        <span className="glass-landing__your">YOUR</span> control.
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
}: {
  installTestId?: string;
  downloadTestId?: string;
  compact?: boolean;
  hero?: boolean;
}) {
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
      <GlassLandingPageContent />
    </GlassBrowseProvider>
  );
}

function GlassLandingPageContent(): JSX.Element {
  const browse = useGlassBrowseOptional();
  const browseActive = browse?.active ?? false;

  useEffect(() => {
    trackGlassBrowsePageViewOnce();
  }, []);

  return (
    <div
      className={`glass-landing${browseActive ? " glass-landing--browse-active" : ""}`}
      data-testid="glass-public-landing"
    >
      <div className="glass-landing__hero-glow" aria-hidden="true" />
      <GlassLandingNav />
      <GlassBrowseOverlay />

      <RevealSection
        id="hero"
        data-glass-section="hero"
        data-glass-scroll-zone
        className="glass-landing__section glass-landing__section--hero"
        immediate
      >
        <div className="glass-landing__hero-copy">
          <p className="glass-landing__eyebrow gl-surface-pill">macOS · Ambient intelligence</p>
          <h1 className="glass-landing__hero-title">IIVO Glass</h1>
          <p className="glass-landing__hero-sub">
            The AI-native ambient builder operating system.
          </p>
          <p className="glass-landing__hero-tagline">
            A glass layer above your desktop — orchestrating agents, terminal, memory, and council while{" "}
            <span className="glass-landing__your">YOU</span> stay in flow. No tab switching. No context lost.
          </p>
          <GlassBrowseEnterCta />
          <DownloadCta
            hero
            installTestId="glass-landing-install-link"
            downloadTestId="glass-landing-download"
          />
        </div>
        <div className={browseActive ? "glass-landing__hero-mock glass-landing__hero-mock--dimmed" : "glass-landing__hero-mock"}>
          <GlassDesktopFrameMock />
        </div>
      </RevealSection>

      <RevealSection
        id="ambient-os"
        data-glass-section="ambient-os"
        data-glass-scroll-zone
        className="glass-landing__section glass-landing__section--split"
      >
        <div className="glass-landing__split-copy gl-reveal-child">
          <p className="glass-landing__section-kicker">Not another chat tab</p>
          <h2 className="glass-landing__section-title">
            Most AI lives inside a browser. Glass is an operating layer.
          </h2>
          <p className="glass-landing__section-body">
            Chat tools wait for you to paste context. IIVO Glass rides on top of macOS — sensing meetings,
            reading screens you capture, and dispatching agents from a single command surface.
          </p>
          <ul className="glass-landing__compare">
            <li className="glass-landing__compare-item gl-surface glass-landing__compare-item--muted">
              <span className="glass-landing__compare-label">Tab AI</span>
              Context switching · copy-paste · lost state
            </li>
            <li className="glass-landing__compare-item gl-surface glass-landing__compare-item--accent">
              <span className="glass-landing__compare-label">Ambient OS</span>
              Overlay · persistent memory · builder orchestration
            </li>
          </ul>
        </div>
        <div className="glass-landing__split-visual gl-reveal-child">
          <AmbientOsStack />
        </div>
      </RevealSection>

      <RevealSection
        id="builder-stack"
        data-glass-section="builder-stack"
        className="glass-landing__section glass-landing__section--features"
      >
        <div className="glass-landing__features-header gl-reveal-child">
          <p className="glass-landing__section-kicker">Four pillars</p>
          <h2 className="glass-landing__section-title glass-landing__section-title--wide">
            Built for builders who think in systems, not prompts.
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
      </RevealSection>

      <RevealSection className="glass-landing__section glass-landing__section--quote">
        <blockquote className="glass-landing__quote gl-surface gl-reveal-child">
          <p>
            “<span className="glass-landing__your">YOU</span> cannot be swallowed by a platform.{" "}
            <span className="glass-landing__your">YOU</span> sit above them all.”
          </p>
        </blockquote>
      </RevealSection>

      <RevealSection id="trust" className="glass-landing__section">
        <div className="gl-reveal-child">
          <p className="glass-landing__section-kicker">Privacy by design</p>
          <h2 className="glass-landing__section-title">
            Built to earn <span className="glass-landing__your">YOUR</span> trust. Not assume it.
          </h2>
        </div>
        <div className="glass-landing__trust-panel gl-surface gl-reveal-child">
          <div className="glass-landing__trust-lines">
            {TRUST_LINES.map((line, index) => (
              <p key={index} className="glass-landing__trust-line">
                {line}
              </p>
            ))}
          </div>
          <p className="glass-landing__trust-close">
            IIVO Glass is a tool that works for <span className="glass-landing__your">YOU</span>. Not a platform
            that works on <span className="glass-landing__your">YOU</span>.
          </p>
        </div>
      </RevealSection>

      <RevealSection className="glass-landing__section glass-landing__final">
        <h2 className="glass-landing__section-title gl-reveal-child">Install the ambient builder OS.</h2>
        <p className="glass-landing__final-lead gl-reveal-child">
          Free beta for macOS. Apple Silicon and Intel. No account required.
        </p>
        <div className="gl-reveal-child">
          <DownloadCta compact downloadTestId="glass-landing-download-final" />
        </div>
      </RevealSection>

      <GlassLandingFooter />
    </div>
  );
}
