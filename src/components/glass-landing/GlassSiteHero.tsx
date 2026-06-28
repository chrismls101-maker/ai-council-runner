import type { JSX, ReactNode } from "react";

const CAPABILITIES = [
  {
    icon: "◉",
    label: "Lens",
    detail: "Fuses context across every window — PDFs, browsers, terminals, notes — in one intelligent session.",
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
    icon: ">_",
    label: "Voice terminal",
    detail: "Aletheia hears you. Glass converts voice to shell, runs it, and ships — without a chat tab in sight.",
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
      <div className="glass-site-hero__atmosphere" aria-hidden="true">
        <span className="glass-site-hero__orb glass-site-hero__orb--tl" />
        <span className="glass-site-hero__orb glass-site-hero__orb--br" />
        <span className="glass-site-hero__grid" />
      </div>

      <header className="glass-site-hero__head">
        <div className="glass-site-hero__status">
          <span className="glass-site-hero__status-dot" />
          <span>Intelligence layer · macOS 14+ · Every app, one surface</span>
        </div>
        <p className="glass-site-hero__eyebrow">Introducing the next layer of AI-native computing</p>
        <h1 className="glass-site-hero__title">IIVO Glass</h1>
        <p className="glass-site-hero__lead">
          Copilots bolt onto apps one at a time. Browser AI lives in a tab.{" "}
          <strong>IIVO Glass is intelligent glass across your entire Mac</strong> — seeing every window,
          hearing every meeting you allow, and building across all of it while{" "}
          <span className="glass-landing__your">YOU</span> never leave flow.
        </p>
      </header>

      <div className="glass-site-hero__body">
        <div className="glass-site-hero__primary">{cta}</div>

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
      </div>

      <footer className="glass-site-hero__foot">
        <span className="glass-site-hero__foot-pill">Cross-window Lens</span>
        <span className="glass-site-hero__foot-pill">Always-on-top glass</span>
        <span className="glass-site-hero__foot-pill">Builder strip + command bar</span>
        <span className="glass-site-hero__foot-pill glass-site-hero__foot-pill--accent">
          Free beta
        </span>
      </footer>
    </div>
  );
}
