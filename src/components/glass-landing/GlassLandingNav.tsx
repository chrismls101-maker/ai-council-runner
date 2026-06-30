import { useState, type JSX } from "react";
import { GLASS_DMG_ARM64_DOWNLOAD_URL } from "../../utils/glassRelease";

const NAV_LINKS = [
  { href: "#ambient-os", label: "The layer" },
  { href: "#capabilities", label: "Features" },
  { href: "#builder-stack", label: "Pillars" },
  { href: "#trust", label: "Trust" },
] as const;

export default function GlassLandingNav(): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = (): void => setMenuOpen(false);

  return (
    <>
      <header className="gl-nav" data-testid="glass-landing-nav">
        <a href="/" className="gl-nav__brand" aria-label="IIVO Glass home">
          <span className="gl-nav__logo">IIVO Glass</span>
        </a>

        <nav className="gl-nav__links" aria-label="Page sections">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="gl-nav__link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="gl-nav__actions">
          <a href="/login" className="gl-nav__signin" data-testid="glass-landing-nav-signin">
            Sign in
          </a>
          <a
            href={GLASS_DMG_ARM64_DOWNLOAD_URL}
            className="gl-nav__cta gl-surface"
            data-testid="glass-landing-nav-download"
          >
            Download
          </a>
        </div>

        <button
          type="button"
          className="gl-nav__menu-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="gl-nav__menu-icon" aria-hidden="true" />
        </button>
      </header>

      <div
        className={`gl-nav-drawer${menuOpen ? " gl-nav-drawer--open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <button
          type="button"
          className="gl-nav-drawer__backdrop"
          aria-label="Close menu"
          onClick={closeMenu}
        />
        <aside className="gl-nav-drawer__panel gl-surface">
          <nav className="gl-nav-drawer__links" aria-label="Mobile navigation">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="gl-nav-drawer__link" onClick={closeMenu}>
                {link.label}
              </a>
            ))}
            <a
              href="/login"
              className="gl-nav-drawer__link gl-nav-drawer__signin"
              data-testid="glass-landing-nav-signin-mobile"
              onClick={closeMenu}
            >
              Sign in
            </a>
            <a
              href={GLASS_DMG_ARM64_DOWNLOAD_URL}
              className="gl-btn gl-btn--primary gl-nav-drawer__download"
              data-testid="glass-landing-nav-download-mobile"
              onClick={closeMenu}
            >
              Download
            </a>
          </nav>
        </aside>
      </div>
    </>
  );
}
