import type { JSX } from "react";

const WELCOME_SHORTCUTS = [
  { keys: ["⌃", "Space"], label: "Natural language" },
  { keys: ["⌘", "⇧", "V"], label: "Voice command" },
  { keys: ["⌘", "E"], label: "Explain error" },
  { keys: ["⌘", "⇧", "E"], label: "Screen analysis" },
  { keys: ["⌘", "⇧", "F"], label: "Search history" },
] as const;

function MicIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v3" />
    </svg>
  );
}

/** Static replica of Glass terminal welcome + natural-language bar (mock data). */
export default function GlassTerminalWelcomeMock(): JSX.Element {
  return (
    <div className="landing-terminal-mock" data-testid="glass-terminal-welcome-mock">
      <div className="landing-terminal-mock__header">
        <span className="landing-terminal-mock__status landing-terminal-mock__status--live" aria-hidden="true" />
        <span className="landing-terminal-mock__title">Glass Terminal</span>
        <span className="landing-terminal-mock__hide">Hide</span>
      </div>

      <div className="landing-terminal-mock__viewport">
        <div className="landing-terminal-mock__welcome">
          <div className="landing-terminal-mock__welcome-inner">
            <div className="landing-terminal-mock__brand">
              <div className="landing-terminal-mock__swarm" aria-hidden="true">
                <span className="landing-terminal-mock__swarm-core" />
                <span className="landing-terminal-mock__swarm-orbit landing-terminal-mock__swarm-orbit--a" />
                <span className="landing-terminal-mock__swarm-orbit landing-terminal-mock__swarm-orbit--b" />
              </div>
              <div className="landing-terminal-mock__brand-text">
                <span className="landing-terminal-mock__logo-text">IIVO Glass</span>
                <p className="landing-terminal-mock__tagline">AI-powered terminal</p>
              </div>
            </div>

            <p className="landing-terminal-mock__section-label">Shortcuts</p>
            <div className="landing-terminal-mock__shortcuts">
              {WELCOME_SHORTCUTS.map(({ keys, label }) => (
                <div key={label} className="landing-terminal-mock__shortcut-row">
                  <span className="landing-terminal-mock__shortcut-label">{label}</span>
                  <div className="landing-terminal-mock__keys" aria-hidden="true">
                    {keys.map((k) => (
                      <kbd key={k} className="landing-terminal-mock__kbd">
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="landing-terminal-mock__nl" role="region" aria-label="Natural language to shell command">
        <div className="landing-terminal-mock__nl-label">
          <div className="landing-terminal-mock__nl-label-main">
            <span className="landing-terminal-mock__nl-icon">⌃</span>
            <span className="landing-terminal-mock__nl-arrow">→</span>
            <span>Shell</span>
          </div>
          <span className="landing-terminal-mock__nl-hint">
            Describe what you want — Enter converts it to a shell command
          </span>
        </div>
        <div className="landing-terminal-mock__nl-row">
          <button type="button" className="landing-terminal-mock__nl-mic" tabIndex={-1} aria-hidden="true">
            <MicIcon />
          </button>
          <div className="landing-terminal-mock__nl-input-wrap">
            <span className="landing-terminal-mock__nl-placeholder">
              e.g. find all files bigger than 100MB in home dir
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
