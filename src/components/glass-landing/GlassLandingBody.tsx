import type { CSSProperties, JSX, ReactNode } from "react";
import AmbientOsStack from "./AmbientOsStack";
import GlassLandingCapabilities from "./GlassLandingCapabilities";
import GlassMonumentFooter from "./GlassMonumentFooter";
import { RevealSection } from "./RevealSection";

const PILLARS = [
  {
    index: "01",
    label: "Ambient",
    title: "Intelligence without interruption",
    copy: (
      <>
        Glass doesn&apos;t replace your apps — it reads them. Every window, every tab, from one transparent
        layer that listens and acts only when <span className="glass-landing__your">YOU</span> allow it.
      </>
    ),
    featured: true,
  },
  {
    index: "02",
    label: "Builder",
    title: "Ship without switching",
    copy: (
      <>
        Agents, Aletheia, Live Writing Intelligence, and the builder strip turn live context into code,
        deploys, and diffs — without the alt-tab tax that kills every other AI tool.
      </>
    ),
  },
  {
    index: "03",
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
    index: "04",
    label: "Operating system",
    title: "The layer your competitors don't have",
    copy: (
      <>
        Command bar, Aletheia, and glass frame work as one system — persistent above macOS, invisible until{" "}
        <span className="glass-landing__your">YOU</span> need it. Always on top. Always{" "}
        <span className="glass-landing__your">YOURS</span>.
      </>
    ),
    featured: true,
  },
] as const;

const TRUST_LINES = [
  {
    index: "01",
    text: (
      <>
        Glass sees and hears what <span className="glass-landing__your">YOU</span> allow — nothing more.
      </>
    ),
  },
  {
    index: "02",
    text: (
      <>
        Screen capture activates only when <span className="glass-landing__your">YOU</span> trigger it.
      </>
    ),
  },
  {
    index: "03",
    text: (
      <>
        Audio recording starts when <span className="glass-landing__your">YOU</span> start it and stops when{" "}
        <span className="glass-landing__your">YOU</span> stop it.
      </>
    ),
  },
  {
    index: "04",
    text: (
      <>
        <span className="glass-landing__your">YOUR</span> council runs are processed on our server and not
        stored beyond <span className="glass-landing__your">YOUR</span> session unless{" "}
        <span className="glass-landing__your">YOU</span> save them.
      </>
    ),
  },
  {
    index: "05",
    text: (
      <>
        <span className="glass-landing__your">YOUR</span> memory is{" "}
        <span className="glass-landing__your">YOURS</span>.{" "}
        <span className="glass-landing__your">YOU</span> can delete it at any time, completely.
      </>
    ),
  },
  {
    index: "06",
    text: (
      <>
        We will never sell <span className="glass-landing__your">YOUR</span> data. We will never train on{" "}
        <span className="glass-landing__your">YOUR</span> private sessions without{" "}
        <span className="glass-landing__your">YOUR</span> explicit consent.
      </>
    ),
  },
] as const;

type GlassLandingBodyProps = {
  downloadCta: ReactNode;
};

function SectionIndex({ value }: { value: string }): JSX.Element {
  return (
    <span className="gl-body-index" aria-hidden="true">
      <span className="gl-body-index__num">{value}</span>
      <span className="gl-body-index__line" />
    </span>
  );
}

export default function GlassLandingBody({ downloadCta }: GlassLandingBodyProps): JSX.Element {
  return (
    <div className="glass-landing__body" data-testid="glass-landing-body">
      <div className="glass-landing__body-atmosphere" aria-hidden="true">
        <div className="glass-landing__body-mesh" />
        <div className="glass-landing__body-grid" />
        <div className="glass-landing__body-glow glass-landing__body-glow--tl" />
        <div className="glass-landing__body-glow glass-landing__body-glow--br" />
        <div className="glass-landing__body-glow glass-landing__body-glow--mid" />
      </div>

      <div className="gl-body-band gl-body-band--layer">
      <RevealSection
        id="ambient-os"
        data-glass-section="ambient-os"
        data-glass-scroll-zone
        className="glass-landing__section glass-landing__section--layer gl-body-section"
      >
        <header className="gl-body-section__mast gl-reveal-child">
          <SectionIndex value="01" />
          <p className="glass-landing__section-kicker">The computing layer</p>
        </header>

        <div className="gl-body-layer">
          <div className="gl-body-layer__copy gl-reveal-child">
            <h2 className="glass-landing__section-title">
              Every app gets intelligence.
              <span className="gl-body-title-accent"> Glass delivers it.</span>
            </h2>
            <p className="glass-landing__section-body">
              Copilots ship inside one app at a time. Chat tools wait for you to paste. IIVO Glass is the
              ambient operating layer — Lens, Live Writing Intelligence, Aletheia voice, multi-agent council,
              and memory that follows you from Safari to Terminal to Figma. Not inside your apps. Above all of
              them.
            </p>

            <div className="gl-body-compare" role="list">
              <article className="gl-body-compare__card gl-body-compare__card--legacy" role="listitem">
                <span className="gl-body-compare__badge">Legacy</span>
                <h3 className="gl-body-compare__title">Tab AI</h3>
                <p className="gl-body-compare__text">
                  One window · paste context · amnesia between sessions
                </p>
              </article>
              <article
                className="gl-body-compare__card gl-body-compare__card--glass gl-body-compare__card--featured"
                role="listitem"
              >
                <span className="gl-body-compare__badge gl-body-compare__badge--live">Intelligent Glass</span>
                <h3 className="gl-body-compare__title">The next layer</h3>
                <p className="gl-body-compare__text">
                  One intelligence surface above Safari, Slack, Xcode, and everything else — context fused,
                  memory persistent, agents orchestrated. Not inside your apps. Above all of them.
                </p>
                <ul className="gl-body-compare__chips" aria-label="Glass capabilities">
                  <li>Lens</li>
                  <li>Live Writing</li>
                  <li>Aletheia</li>
                  <li>Council</li>
                </ul>
              </article>
            </div>
          </div>

          <div className="gl-body-layer__visual gl-reveal-child">
            <div className="gl-body-visual-frame">
              <div className="gl-body-visual-frame__chrome">
                <span />
                <span />
                <span />
                <em>System architecture</em>
              </div>
              <AmbientOsStack />
            </div>
          </div>
        </div>
      </RevealSection>
      </div>

      <div className="gl-body-band gl-body-band--capabilities">
      <RevealSection
        id="capabilities"
        data-glass-section="capabilities"
        data-glass-scroll-zone
        className="glass-landing__section glass-landing__section--capabilities gl-body-section"
      >
        <header className="gl-body-section__mast gl-body-section__mast--center gl-reveal-child">
          <SectionIndex value="02" />
          <p className="glass-landing__section-kicker">Capabilities</p>
          <h2 className="glass-landing__section-title glass-landing__section-title--wide">
            Intelligence that ships with the OS.
            <span className="gl-body-title-accent"> Not bolted onto a browser tab.</span>
          </h2>
        </header>
        <GlassLandingCapabilities />
      </RevealSection>
      </div>

      <div className="gl-body-band gl-body-band--pillars">
      <RevealSection
        id="builder-stack"
        data-glass-section="builder-stack"
        className="glass-landing__section glass-landing__section--pillars gl-body-section"
      >
        <header className="gl-body-section__mast gl-body-section__mast--center gl-reveal-child">
          <SectionIndex value="03" />
          <p className="glass-landing__section-kicker">Why Glass wins</p>
          <h2 className="glass-landing__section-title glass-landing__section-title--wide">
            Four pillars.
            <span className="gl-body-title-accent"> One intelligence layer above everything.</span>
          </h2>
        </header>

        <div className="gl-body-bento">
          {PILLARS.map((pillar, i) => {
            const { index, label, title, copy } = pillar;
            const featured = "featured" in pillar && pillar.featured === true;
            return (
            <article
              key={label}
              className={[
                "gl-body-bento__card",
                featured ? "gl-body-bento__card--featured" : "",
                "gl-reveal-child",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ "--stagger": i } as CSSProperties}
            >
              <div className="gl-body-bento__head">
                <span className="gl-body-bento__index">{index}</span>
                <span className="glass-landing__card-label">{label}</span>
              </div>
              <p className="glass-landing__card-title">{title}</p>
              <p className="glass-landing__card-text">{copy}</p>
              <span className="gl-body-bento__rim" aria-hidden="true" />
            </article>
            );
          })}
        </div>
      </RevealSection>
      </div>

      <RevealSection className="glass-landing__section glass-landing__section--manifesto gl-body-section">
        <blockquote className="gl-body-manifesto gl-reveal-child">
          <p className="gl-body-manifesto__quote">
            “Platforms want you inside their tab. Glass puts{" "}
            <span className="glass-landing__your">YOU</span> above all of them.”
          </p>
          <footer className="gl-body-manifesto__cite">
            <span className="gl-body-manifesto__mark" aria-hidden="true" />
            The IIVO thesis on AI-native computing
          </footer>
        </blockquote>
      </RevealSection>

      <div className="gl-body-band gl-body-band--trust">
      <RevealSection id="trust" className="glass-landing__section glass-landing__section--trust gl-body-section">
        <div className="gl-body-trust">
          <header className="gl-body-trust__head gl-reveal-child">
            <SectionIndex value="04" />
            <p className="glass-landing__section-kicker">Privacy by design</p>
            <h2 className="glass-landing__section-title">
              Built to earn <span className="glass-landing__your">YOUR</span> trust.
              <span className="gl-body-title-accent"> Not assume it.</span>
            </h2>
            <p className="gl-body-trust__lead">
              Every permission is explicit. Every signal is yours to grant or revoke. Glass works for you — not
              for a platform funnel.
            </p>
          </header>

          <div className="gl-body-trust__grid gl-reveal-child">
            {TRUST_LINES.map(({ index, text }) => (
              <div key={index} className="gl-body-trust__item">
                <span className="gl-body-trust__index">{index}</span>
                <p className="glass-landing__trust-line">{text}</p>
              </div>
            ))}
          </div>

          <p className="gl-body-trust__close gl-reveal-child">
            IIVO Glass works for <span className="glass-landing__your">YOU</span> — above every app. Not a
            platform that traps <span className="glass-landing__your">YOU</span> inside theirs.
          </p>
        </div>
      </RevealSection>
      </div>

      <GlassMonumentFooter downloadCta={downloadCta} />
    </div>
  );
}
