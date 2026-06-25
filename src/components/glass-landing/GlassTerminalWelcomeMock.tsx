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

function ChevronDownIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/** Static replica of Glass Terminal welcome + NL shell bar (matches GlassTerminalPanel). */
export default function GlassTerminalWelcomeMock(): JSX.Element {
  return (
    <div className="landing-terminal-mock glass-terminal-panel" data-testid="glass-terminal-welcome-mock">
      <div className="glass-terminal-header landing-terminal-mock__header">
        <span
          className="glass-terminal-header__status glass-terminal-header__status--live"
          aria-hidden="true"
        />
        <div className="landing-terminal-mock__tabs" aria-hidden="true">
          <span className="landing-terminal-mock__tab landing-terminal-mock__tab--active">
            <span className="landing-terminal-mock__tab-title">zsh</span>
          </span>
          <span className="landing-terminal-mock__tab landing-terminal-mock__tab--new">+</span>
        </div>
        <div className="glass-terminal-header__controls">
          <span className="glass-terminal-ctrl-btn glass-terminal-ctrl-btn--hide landing-terminal-mock__hide">
            <ChevronDownIcon />
            <span>Hide</span>
          </span>
        </div>
      </div>

      <div className="landing-terminal-mock__viewport glass-terminal-viewport">
        <div className="glass-terminal-welcome glass-terminal-welcome--visible landing-terminal-mock__welcome">
          <div className="gtw-inner landing-terminal-mock__welcome-inner">
            <div className="gtw-brand landing-terminal-mock__brand">
              <div className="gtw-swarm-wrap landing-terminal-mock__swarm-wrap">
                <div className="landing-terminal-mock__swarm" aria-hidden="true">
                  <span className="landing-terminal-mock__swarm-core" />
                  <span className="landing-terminal-mock__swarm-particle landing-terminal-mock__swarm-particle--a" />
                  <span className="landing-terminal-mock__swarm-particle landing-terminal-mock__swarm-particle--b" />
                  <span className="landing-terminal-mock__swarm-particle landing-terminal-mock__swarm-particle--c" />
                  <span className="landing-terminal-mock__swarm-ring landing-terminal-mock__swarm-ring--a" />
                  <span className="landing-terminal-mock__swarm-ring landing-terminal-mock__swarm-ring--b" />
                </div>
              </div>
              <div className="gtw-brand-text landing-terminal-mock__brand-text">
                <span className="gtw-logo-text landing-terminal-mock__logo-text">IIVO Glass</span>
                <p className="gtw-tagline landing-terminal-mock__tagline">AI-powered terminal</p>
              </div>
            </div>

            <p className="gtw-section-label landing-terminal-mock__section-label">Shortcuts</p>
            <div className="gtw-features landing-terminal-mock__shortcuts">
              {WELCOME_SHORTCUTS.map(({ keys, label }) => (
                <div key={label} className="gtw-row landing-terminal-mock__shortcut-row">
                  <span className="gtw-label landing-terminal-mock__shortcut-label">{label}</span>
                  <div className="gtw-keys landing-terminal-mock__keys" aria-hidden="true">
                    {keys.map((k) => (
                      <kbd key={k} className="gtw-kbd landing-terminal-mock__kbd">
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

      <div className="gtp-nl-bar landing-terminal-mock__nl" role="region" aria-label="Natural language to shell command">
        <div className="gtp-nl-label landing-terminal-mock__nl-label">
          <div className="gtp-nl-label-main landing-terminal-mock__nl-label-main">
            <span className="gtp-nl-label-icon landing-terminal-mock__nl-icon">⌃</span>
            <span className="gtp-nl-label-arrow landing-terminal-mock__nl-arrow">→</span>
            <span>Shell</span>
          </div>
          <span className="gtp-nl-label-hint landing-terminal-mock__nl-hint">
            Describe what you want — Enter converts it to a shell command
          </span>
        </div>
        <div className="gtp-nl-input-row landing-terminal-mock__nl-row">
          <button type="button" className="gtp-nl-mic-btn landing-terminal-mock__nl-mic" tabIndex={-1} aria-hidden="true">
            <MicIcon />
          </button>
          <div className="gtp-nl-input-wrap landing-terminal-mock__nl-input-wrap">
            <span className="landing-terminal-mock__nl-placeholder">
              e.g. find all files bigger than 100MB in home dir
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
