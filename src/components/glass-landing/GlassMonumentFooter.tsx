import type { CSSProperties, JSX, ReactNode } from "react";
import { GLASS_DMG_ARM64_DOWNLOAD_URL } from "../../utils/glassRelease";

const MONUMENT_LETTERS = ["G", "L", "A", "S", "S"] as const;

type GlassMonumentFooterProps = {
  downloadCta: ReactNode;
};

export default function GlassMonumentFooter({ downloadCta }: GlassMonumentFooterProps): JSX.Element {
  return (
    <footer className="glass-monument" data-testid="glass-landing-footer">
      <div className="glass-monument__halo" aria-hidden="true" />

      <div className="glass-monument__pre">
        <p className="glass-monument__kicker">The next layer is live</p>
        <p className="glass-monument__line">One download. Every window. One intelligence above all of them.</p>
        {downloadCta}
      </div>

      <div className="glass-monument__stage" aria-hidden="true">
        <div className="glass-monument__letters">
          {MONUMENT_LETTERS.map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              className="glass-monument__letter"
              style={{ "--letter-i": index } as CSSProperties}
            >
              <span className="glass-monument__letter-face">{letter}</span>
              <span className="glass-monument__letter-shine" />
            </span>
          ))}
        </div>
        <p className="glass-monument__wordmark">
          <span>IIVO</span>
          <span className="glass-monument__wordmark-glass">Glass</span>
        </p>
      </div>

      <div className="glass-monument__base">
        <p className="glass-monument__tagline">
          Intelligent glass — not inside your apps. Above them.
        </p>
        <nav className="glass-monument__legal" aria-label="Legal links">
          <a href="/privacy" className="glass-monument__legal-link" data-testid="glass-landing-privacy-link">
            Privacy
          </a>
          <span className="glass-monument__legal-sep" aria-hidden="true">
            ·
          </span>
          <a href="/terms" className="glass-monument__legal-link" data-testid="glass-landing-terms-link">
            Terms
          </a>
          <span className="glass-monument__legal-sep" aria-hidden="true">
            ·
          </span>
          <a href={GLASS_DMG_ARM64_DOWNLOAD_URL} className="glass-monument__legal-link">
            Download
          </a>
        </nav>
      </div>
    </footer>
  );
}
