import { useReducedMotion } from "framer-motion";
import { motion } from "framer-motion";
import GlassButton from "../components/glass-landing/GlassButton";
import GlassCard from "../components/glass-landing/GlassCard";
import GlassHeroMock from "../components/glass-landing/GlassHeroMock";
import GlassLandingFooter from "../components/glass-landing/GlassLandingFooter";
import GlassPanel from "../components/glass-landing/GlassPanel";
import "../components/glass-landing/glass-landing.css";
import "../components/glass-landing/glass-landing-prototype.css";
import { GLASS_DMG_ARM64_DOWNLOAD_URL, GLASS_DMG_X64_DOWNLOAD_URL } from "../utils/glassRelease";

const SURFACES = [
  {
    label: "Listen",
    copy: (
      <>
        Captures what matters in <span className="glp-your">YOUR</span> meetings — when{" "}
        <span className="glp-your">YOU</span> start it.
      </>
    ),
  },
  {
    label: "See",
    copy: (
      <>
        Understands <span className="glp-your">YOUR</span> screen context when{" "}
        <span className="glp-your">YOU</span> capture it.
      </>
    ),
  },
  {
    label: "Translate",
    copy: <>Live translation across languages, right on top of your work.</>,
  },
  {
    label: "Council",
    copy: (
      <>
        Five-agent council on decisions <span className="glp-your">YOU</span> face — not generic chat in a tab.
      </>
    ),
  },
] as const;

const TRUST_LINES = [
  <>Glass sees and hears what <span className="glp-your">YOU</span> allow — nothing more.</>,
  <>Screen capture activates only when <span className="glp-your">YOU</span> trigger it.</>,
  <>Audio recording starts when <span className="glp-your">YOU</span> start it and stops when <span className="glp-your">YOU</span> stop it.</>,
  <>
    <span className="glp-your">YOUR</span> memory is <span className="glp-your">YOURS</span>.{" "}
    <span className="glp-your">YOU</span> can delete it at any time.
  </>,
  <>We will never sell <span className="glp-your">YOUR</span> data.</>,
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function PrototypeBackground(): JSX.Element {
  return (
    <div className="glp-bg" aria-hidden="true">
      <div className="glp-bg__bloom-emerald" />
      <div className="glp-bg__bloom-sapphire" />
      <div className="glp-bg__grid" />
      <div className="glp-bg__noise" />
    </div>
  );
}

function DownloadPanel({
  compact = false,
  downloadTestId,
}: {
  compact?: boolean;
  downloadTestId?: string;
}): JSX.Element {
  return (
    <GlassPanel className="glp-download-panel">
      <span className="ui-led-line glp-download-panel__led" aria-hidden="true" />
      {!compact ? <p className="glp-download-panel__title">Download for Mac</p> : null}
      <div className="glp-download-stack">
        <GlassButton href={GLASS_DMG_ARM64_DOWNLOAD_URL} data-testid={downloadTestId}>
          Apple Silicon (2020 and later)
        </GlassButton>
        <GlassButton
          href={GLASS_DMG_X64_DOWNLOAD_URL}
          className="glass-button--secondary"
          data-testid={downloadTestId ? `${downloadTestId}-x64` : undefined}
        >
          Intel (2019 and earlier)
        </GlassButton>
        <a href="/install" className="glp-install-link">
          Installation Guide →
        </a>
      </div>
      <div className="glp-chips">
        <span className="glp-chip">macOS 14+</span>
        <span className="glp-chip">Free beta</span>
        <span className="glp-chip">No account required</span>
      </div>
    </GlassPanel>
  );
}

export default function GlassLandingPrototypePage(): JSX.Element {
  const reduceMotion = useReducedMotion();

  const motionProps = reduceMotion
    ? {}
    : {
        initial: "hidden" as const,
        whileInView: "visible" as const,
        viewport: { once: true, margin: "-8%" },
        transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="glass-landing-prototype" data-testid="glass-landing-prototype">
      <div className="glp-banner">
        <strong>Prototype</strong>
        <span>New landing preview — not live at / yet.</span>
        <a href="/">View current landing</a>
      </div>

      <PrototypeBackground />

      <motion.section
        className="glp-section glp-section--hero"
        {...(reduceMotion
          ? {}
          : {
              initial: "hidden",
              animate: "visible",
              variants: fadeUp,
              transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
            })}
      >
        <div className="glp-hero-copy">
          <p className="glp-eyebrow">Intelligence layer · macOS</p>
          <h1 className="glp-title">IIVO Glass</h1>
          <span className="ui-led-line glp-title-led" aria-hidden="true" />
          <p className="glp-sub">
            The layer that lives above <span className="glp-your">YOUR</span> work.
          </p>
          <p className="glp-tagline">
            Always on top. Always thinking with <span className="glp-your">YOU</span>. Never buried in a browser tab.
          </p>
          <DownloadPanel downloadTestId="glp-download-hero" />
        </div>

        <GlassHeroMock />
      </motion.section>

      <motion.section className="glp-section" variants={fadeUp} {...motionProps}>
        <h2 className="glp-section-title">Four surfaces. One overlay.</h2>
        <div className="glp-cards">
          {SURFACES.map(({ label, copy }) => (
            <GlassCard key={label}>
              <span className="glp-card-label">{label}</span>
              {copy}
            </GlassCard>
          ))}
        </div>
      </motion.section>

      <motion.section className="glp-section" variants={fadeUp} {...motionProps}>
        <h2 className="glp-section-title">Most AI lives inside a tab.</h2>
        <p className="glp-section-body">
          <span className="glp-your">YOU</span> paste into it. Wait for it. Switch back and lose context. IIVO Glass
          comes to <span className="glp-your">YOU</span> — on top of whatever{" "}
          <span className="glp-your">YOU</span> are already doing.
        </p>
      </motion.section>

      <motion.section className="glp-section" variants={fadeUp} {...motionProps}>
        <h2 className="glp-section-title">
          Built to earn <span className="glp-your">YOUR</span> trust.
        </h2>
        <GlassPanel>
          <span className="ui-led-line glp-download-panel__led" aria-hidden="true" />
          <div className="glp-trust-lines">
            {TRUST_LINES.map((line, index) => (
              <p key={index} className="glp-trust-line">
                {line}
              </p>
            ))}
          </div>
        </GlassPanel>
      </motion.section>

      <motion.section className="glp-section glp-final" variants={fadeUp} {...motionProps}>
        <h2 className="glp-section-title">Ready to think above everything else?</h2>
        <DownloadPanel compact downloadTestId="glp-download-final" />
      </motion.section>

      <GlassLandingFooter />
    </div>
  );
}
