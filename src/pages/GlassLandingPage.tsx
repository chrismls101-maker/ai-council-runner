import { useReducedMotion } from "framer-motion";
import { motion } from "framer-motion";
import {
  AnimatedGlassBackground,
  GlassButton,
  GlassCard,
  GlassPanel,
} from "../components/glass-landing/index.ts";
import GlassLandingFooter from "../components/glass-landing/GlassLandingFooter";
import "../components/glass-landing/glass-landing.css";

const GLASS_DMG_DOWNLOAD_URL =
  "https://github.com/chrismls101-maker/ai-council-runner/releases/download/v0.1.8/IIVO.Glass-0.1.8-arm64.dmg";

const FEATURES = [
  <>It listens to <span className="glass-landing__your">YOUR</span> meetings and captures what matters.</>,
  <>It sees <span className="glass-landing__your">YOUR</span> screen and understands the context.</>,
  <>It translates in real time across languages.</>,
  <>It runs a five-agent AI council on any decision <span className="glass-landing__your">YOU</span> face.</>,
];

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

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

function DownloadButton() {
  return (
    <GlassButton href={GLASS_DMG_DOWNLOAD_URL} data-testid="glass-landing-download">
      Download for Mac — Apple Silicon
    </GlassButton>
  );
}

export default function GlassLandingPage() {
  const reduceMotion = useReducedMotion();

  const motionProps = reduceMotion
    ? {}
    : {
        initial: "hidden" as const,
        whileInView: "visible" as const,
        viewport: { once: true, margin: "-8%" },
        transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="glass-landing" data-testid="glass-public-landing">
      <AnimatedGlassBackground />

      <motion.section
        className="glass-landing__section glass-landing__section--hero"
        {...(reduceMotion ? {} : { initial: "hidden", animate: "visible", variants: fadeUp, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } })}
      >
        <p className="glass-landing__eyebrow">Intelligence layer · macOS</p>
        <h1 className="glass-landing__hero-title">IIVO Glass</h1>
        <p className="glass-landing__hero-sub">
          The intelligence layer that lives above <span className="glass-landing__your">YOUR</span> work.
        </p>
        <p className="glass-landing__hero-tagline">
          <span className="glass-landing__your">YOU</span> cannot be swallowed by a platform.{" "}
          <span className="glass-landing__your">YOU</span> sit above them all.
        </p>
        <div className="glass-landing__hero-cta">
          <DownloadButton />
        </div>
        <p className="glass-landing__hero-note">Free beta. No account required.</p>
      </motion.section>

      <motion.section className="glass-landing__section" variants={fadeUp} {...motionProps}>
        <h2 className="glass-landing__section-title">
          Always on top. Always thinking with <span className="glass-landing__your">YOU</span>. Never in the way.
        </h2>
        <div className="glass-landing__cards">
          {FEATURES.map((copy, index) => (
            <GlassCard key={index}>{copy}</GlassCard>
          ))}
        </div>
      </motion.section>

      <motion.section className="glass-landing__section" variants={fadeUp} {...motionProps}>
        <h2 className="glass-landing__section-title">Most AI lives inside a tab.</h2>
        <p className="glass-landing__section-body">
          <span className="glass-landing__your">YOU</span> have to go to it. Paste into it. Wait for it. IIVO Glass
          comes to <span className="glass-landing__your">YOU</span> — on top of whatever{" "}
          <span className="glass-landing__your">YOU</span> are already doing. No switching. No context lost. No
          interruption.
        </p>
      </motion.section>

      <motion.section className="glass-landing__section" variants={fadeUp} {...motionProps}>
        <h2 className="glass-landing__section-title">
          Built to earn <span className="glass-landing__your">YOUR</span> trust. Not assume it.
        </h2>
        <GlassPanel>
          <div className="glass-landing__trust-lines">
            {TRUST_LINES.map((line, index) => (
              <p key={index} className="glass-landing__trust-line">
                {line}
              </p>
            ))}
          </div>
          <p className="glass-landing__trust-close">
            IIVO Glass is a tool that works for <span className="glass-landing__your">YOU</span>. Not a platform that
            works on <span className="glass-landing__your">YOU</span>.
          </p>
        </GlassPanel>
      </motion.section>

      <motion.section
        className="glass-landing__section glass-landing__final"
        variants={fadeUp}
        {...motionProps}
      >
        <h2 className="glass-landing__section-title">Ready to think above everything else?</h2>
        <DownloadButton />
        <p className="glass-landing__final-note">Mac Apple Silicon · Free Beta · No account required</p>
      </motion.section>

      <GlassLandingFooter />
    </div>
  );
}
