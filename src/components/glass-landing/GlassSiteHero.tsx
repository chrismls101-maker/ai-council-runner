import type { JSX, ReactNode } from "react";
import GlassCinematicWords from "./GlassCinematicWords";
import GlassIntelligentCard from "./GlassIntelligentCard";

const CAPABILITIES = [
  {
    icon: "◉",
    label: "Lens",
    detail: "Fuses context across every window — PDFs, browsers, notes, decks — in one intelligent session.",
  },
  {
    icon: "◈",
    label: "Agent council",
    detail: "Coder, research, and writing agents dispatch from one surface. No alt-tab. No paste tax.",
  },
  {
    icon: "◎",
    label: "Session memory",
    detail: "What Glass learns in Figma follows you to Xcode. Memory compounds across apps you choose to keep.",
  },
  {
    icon: "▷",
    label: "Listen mode",
    detail: "Meetings and system audio become live notes, translation, and action items — while you stay in the room.",
  },
  {
    icon: "◎",
    label: "Aletheia",
    detail: "Voice-native command surface — ask across your entire desktop without opening another chat tab.",
  },
  {
    icon: "⬡",
    label: "Visual ask",
    detail: "Point at any pixel on screen. Glass reasons over what you see and everything around it.",
  },
] as const;

export default function GlassSiteHero({ cta }: { cta: ReactNode }): JSX.Element {
  return (
    <div className="glass-site-hero">
      <section className="glass-hero-cinema" aria-label="IIVO Glass cinematic hero">
        <GlassCinematicWords phraseMs={2400} loop />
        <div className="glass-hero-cinema__scroll" aria-hidden="true">
          <span className="glass-hero-cinema__scroll-line" />
          <span className="glass-hero-cinema__scroll-label">Scroll</span>
        </div>
      </section>

      <div className="glass-site-hero__rest">
        <header className="glass-site-hero__head">
          <p className="glass-site-hero__eyebrow">AI-native computing layer</p>
          <h1 className="glass-site-hero__title">IIVO Glass</h1>
          <p className="glass-site-hero__lead">
            Not another tab. Not another copilot bolted onto one app.{" "}
            <strong>IIVO Glass is the intelligence layer above your entire Mac</strong> — reading every
            window, hearing every meeting you allow, and building across all of it while{" "}
            <span className="glass-landing__your">YOU</span> never leave flow.
          </p>
        </header>

        <div className="glass-site-hero__body">
          <div className="glass-site-hero__primary">{cta}</div>
          <GlassIntelligentCard />
        </div>

        <div className="glass-site-hero__capabilities" aria-label="Glass OS capabilities">
          {CAPABILITIES.map((cap) => (
            <article key={cap.label} className="glass-site-hero__cap">
              <span className="glass-site-hero__cap-icon" aria-hidden="true">
                {cap.icon}
              </span>
              <div className="glass-site-hero__cap-copy">
                <p className="glass-site-hero__cap-label">{cap.label}</p>
                <p className="glass-site-hero__cap-detail">{cap.detail}</p>
              </div>
            </article>
          ))}
        </div>

        <footer className="glass-site-hero__foot">
          <span className="glass-site-hero__foot-pill">Cross-window Lens</span>
          <span className="glass-site-hero__foot-pill">Always-on-top glass</span>
          <span className="glass-site-hero__foot-pill">Aletheia command bar</span>
          <span className="glass-site-hero__foot-pill glass-site-hero__foot-pill--accent">
            Free beta
          </span>
        </footer>
      </div>
    </div>
  );
}
