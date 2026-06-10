import type { JSX } from "react";

export default function GlassLandingFooter(): JSX.Element {
  return (
    <footer className="glass-landing__footer" data-testid="glass-landing-footer">
      <nav className="glass-landing__footer-nav" aria-label="Legal links">
        <a href="/privacy" className="glass-landing__footer-link" data-testid="glass-landing-privacy-link">
          Privacy Policy
        </a>
        <span className="glass-landing__footer-sep" aria-hidden="true">
          ·
        </span>
        <a href="/terms" className="glass-landing__footer-link" data-testid="glass-landing-terms-link">
          Terms of Service
        </a>
      </nav>
    </footer>
  );
}
