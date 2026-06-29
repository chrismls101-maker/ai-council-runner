import { useEffect, useState, type JSX } from "react";

const LIVE_STATES = [
  {
    signal: "Lens fusion",
    reading: "3 windows · PDF brief · meeting notes · terminal",
    action: "Cross-window context ready",
  },
  {
    signal: "Council routing",
    reading: "Coder · Research · Writing agents on standby",
    action: "Multi-agent dispatch armed",
  },
  {
    signal: "Session memory",
    reading: "Memory compounding across Figma → Xcode → Safari",
    action: "Context persists above apps",
  },
  {
    signal: "Ambient listen",
    reading: "Audio capture idle · awaiting your command",
    action: "Hear only when you allow",
  },
] as const;

export default function GlassIntelligentCard(): JSX.Element {
  const [index, setIndex] = useState(0);
  const state = LIVE_STATES[index];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % LIVE_STATES.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <article className="glass-intel-card" aria-label="Live intelligent glass layer">
      <div className="glass-intel-card__rim" aria-hidden="true" />
      <div className="glass-intel-card__liquid" aria-hidden="true" />

      <header className="glass-intel-card__head">
        <div className="glass-intel-card__live">
          <span className="glass-intel-card__pulse" aria-hidden="true" />
          <span>Live layer</span>
        </div>
        <p className="glass-intel-card__title">Intelligent glass</p>
        <p className="glass-intel-card__subtitle">
          The AI-native computing layer above your entire Mac — reading, reasoning, and building
          across every window you allow.
        </p>
      </header>

      <div className="glass-intel-card__body" key={state.signal}>
        <div className="glass-intel-card__signal-row">
          <span className="glass-intel-card__signal">{state.signal}</span>
          <span className="glass-intel-card__chip">OS-level</span>
        </div>
        <p className="glass-intel-card__reading">{state.reading}</p>
        <p className="glass-intel-card__action">{state.action}</p>
      </div>

      <footer className="glass-intel-card__foot">
        <span>Always above</span>
        <span>Never inside a tab</span>
        <span>Your Mac, elevated</span>
      </footer>
    </article>
  );
}
