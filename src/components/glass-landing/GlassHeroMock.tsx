import type { JSX } from "react";

/** CSS-only hero mock — dock + command bar silhouette (matches Glass app chrome). */
export default function GlassHeroMock(): JSX.Element {
  return (
    <div className="glp-hero-mock" aria-hidden="true">
      <div className="glp-hero-mock__desktop">
        <div className="glp-hero-mock__window glp-hero-mock__window--back" />
        <div className="glp-hero-mock__window glp-hero-mock__window--front">
          <div className="glp-hero-mock__window-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="glp-hero-mock__window-body">
            <div className="glp-hero-mock__code-line glp-hero-mock__code-line--dim" />
            <div className="glp-hero-mock__code-line" />
            <div className="glp-hero-mock__code-line glp-hero-mock__code-line--accent" />
            <div className="glp-hero-mock__code-line glp-hero-mock__code-line--short" />
          </div>
        </div>
      </div>

      <div className="glp-hero-mock__hud">
        <div className="glp-hero-mock__command-bar">
          <span className="glp-hero-mock__command-led ui-led-line" />
          <div className="glp-hero-mock__command-inner">
            <span className="glp-hero-mock__command-prompt">Ask IIVO anything…</span>
            <span className="glp-hero-mock__command-chip">Listen</span>
          </div>
        </div>

        <div className="glp-hero-mock__dock">
          <span className="glp-hero-mock__dock-led ui-led-line" />
          <div className="glp-hero-mock__dock-pill">
            <span className="glp-hero-mock__dock-dot" />
            <span className="glp-hero-mock__dock-seg" />
            <span className="glp-hero-mock__dock-seg glp-hero-mock__dock-seg--active" />
            <span className="glp-hero-mock__dock-seg" />
          </div>
        </div>
      </div>
    </div>
  );
}
