import type { JSX } from "react";

export default function GlassStripBarMock(): JSX.Element {
  return (
    <div className="gl-strip-mock" data-testid="glass-strip-bar-mock">
      <div className="gl-strip-mock__glow" aria-hidden="true" />
      <div className="gl-strip-mock__bar gl-surface">
        <div className="gl-strip-mock__icons" aria-hidden="true">
          <svg className="gl-strip-mock__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
            <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
            <path d="M12 18v3" />
          </svg>
          <svg className="gl-strip-mock__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="m5 8 6 6" />
            <path d="m4 14 6-6 2-3" />
            <path d="M2 5h12" />
            <path d="M7 2h1" />
            <path d="m22 22-5-10-5 10" />
            <path d="M14 18h6" />
          </svg>
          <svg className="gl-strip-mock__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        </div>
        <span className="gl-strip-mock__status">
          <span className="gl-strip-mock__dot" aria-hidden="true" />
          Listening…
        </span>
      </div>
    </div>
  );
}
