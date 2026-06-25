import type { JSX } from "react";

/** CSS-only hero mock — dock + command bar + agent panel silhouette. */
export default function GlassHeroMock(): JSX.Element {
  return (
    <div className="gl-hero-mock" aria-hidden="true">
      <div className="gl-hero-mock__desktop">
        <div className="gl-hero-mock__window gl-hero-mock__window--back" />
        <div className="gl-hero-mock__window gl-hero-mock__window--front">
          <div className="gl-hero-mock__window-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="gl-hero-mock__window-body">
            <div className="gl-hero-mock__code-line gl-hero-mock__code-line--dim" />
            <div className="gl-hero-mock__code-line" />
            <div className="gl-hero-mock__code-line gl-hero-mock__code-line--accent" />
            <div className="gl-hero-mock__code-line gl-hero-mock__code-line--short" />
          </div>
        </div>

        <div className="gl-hero-mock__agent-panel">
          <span className="gl-hero-mock__agent-led ui-led-line" />
          <div className="gl-hero-mock__agent-row">
            <span className="gl-hero-mock__agent-dot" />
            <span className="gl-hero-mock__agent-label">Agent running</span>
          </div>
          <div className="gl-hero-mock__agent-line" />
          <div className="gl-hero-mock__agent-line gl-hero-mock__agent-line--short" />
        </div>
      </div>

      <div className="gl-hero-mock__hud">
        <div className="gl-hero-mock__command-bar">
          <span className="gl-hero-mock__command-led ui-led-line" />
          <div className="gl-hero-mock__command-inner">
            <span className="gl-hero-mock__command-prompt">Build from this screen…</span>
            <span className="gl-hero-mock__command-chip">Agents</span>
          </div>
        </div>

        <div className="gl-hero-mock__strip">
          <span className="gl-hero-mock__strip-seg gl-hero-mock__strip-seg--active">Agents</span>
          <span className="gl-hero-mock__strip-seg">Terminal</span>
          <span className="gl-hero-mock__strip-seg">Powers</span>
        </div>

        <div className="gl-hero-mock__dock">
          <span className="gl-hero-mock__dock-led ui-led-line" />
          <div className="gl-hero-mock__dock-pill">
            <span className="gl-hero-mock__dock-dot" />
            <span className="gl-hero-mock__dock-seg" />
            <span className="gl-hero-mock__dock-seg gl-hero-mock__dock-seg--active" />
            <span className="gl-hero-mock__dock-seg" />
          </div>
        </div>
      </div>
    </div>
  );
}
