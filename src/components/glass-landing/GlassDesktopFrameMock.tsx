import type { JSX } from "react";

const MAC_DOCK_ICONS = [
  { label: "Finder", tone: "finder", active: false },
  { label: "Safari", tone: "safari", active: true },
  { label: "Mail", tone: "mail", active: false },
  { label: "Messages", tone: "messages", active: false },
  { label: "Maps", tone: "maps", active: false },
  { label: "Photos", tone: "photos", active: false },
  { label: "FaceTime", tone: "facetime", active: false },
  { label: "Calendar", tone: "calendar", active: false },
  { label: "Contacts", tone: "contacts", active: false },
  { label: "Reminders", tone: "reminders", active: false },
  { label: "Notes", tone: "notes", active: false },
  { label: "TV", tone: "tv", active: false },
  { label: "Music", tone: "music", active: false },
  { label: "Podcasts", tone: "podcasts", active: false },
  { label: "App Store", tone: "appstore", active: false },
  { label: "Settings", tone: "settings", active: false },
  { label: "Cursor", tone: "cursor", active: true },
  { label: "Terminal", tone: "terminal", active: false },
  { label: "Slack", tone: "slack", active: false },
  { label: "Chrome", tone: "chrome", active: false },
  { divider: true as const },
  { label: "Trash", tone: "trash", active: false },
] as const;

const BROWSER_TABS = [
  { label: "IIVO Glass — iivo.ai", active: true },
  { label: "Glass Docs", active: false },
  { label: "GitHub", active: false },
  { label: "Linear", active: false },
] as const;

const BUILDER_LEFT_TABS = [
  { icon: "▦", label: "Dashboard", kind: "dashboard" },
  { icon: "⌥", label: "Prompts", kind: "prompts" },
  { icon: "⚡", label: "Prompt Gen", kind: "power-prompt" },
  { icon: "🗝", label: "API Keys", kind: "keys" },
  { icon: "💸", label: "Spend", kind: "spend" },
  { icon: "⬡", label: "Extract", kind: "extract" },
  { icon: ">_", label: "Terminal", kind: "terminal" },
] as const;

const BUILDER_RIGHT_TABS = [
  { label: "Aletheia", kind: "aletheia" as const },
  { icon: "◈", label: "Agents", kind: "agents" as const, active: true },
  { label: "Powers Menu", kind: "powers" as const },
  { label: "Command Palette", kind: "palette" as const },
] as const;

const GLASS_RAIL_ICONS = ["G", "◫", "▷", ">_"] as const;

/** MacBook desktop with macOS chrome + IIVO Glass overlay (frame, rail dock, strip, command bar). */
export default function GlassDesktopFrameMock({ heroStage = false }: { heroStage?: boolean }): JSX.Element {
  return (
    <div
      className={`gl-macbook-mock${heroStage ? " gl-macbook-mock--hero-stage" : ""}`}
      data-testid="glass-desktop-frame-mock"
    >
      <div className="gl-macbook-mock__device">
        <div className="gl-macbook-mock__bezel">
          <span className="gl-macbook-mock__camera" aria-hidden="true" />

          <div className="gl-macbook-mock__display">
            {/* macOS desktop */}
            <div className="gl-macbook-mock__desktop" aria-hidden="true">
              <div className="gl-macbook-mock__menubar">
                <div className="gl-macbook-mock__menubar-left">
                  <span className="gl-macbook-mock__apple-mark" />
                  <span className="gl-macbook-mock__menubar-app">Safari</span>
                  <span>File</span>
                  <span>Edit</span>
                  <span>View</span>
                </div>
                <div className="gl-macbook-mock__menubar-right">
                  <span className="gl-macbook-mock__menubar-icon gl-macbook-mock__menubar-icon--wifi" />
                  <span className="gl-macbook-mock__menubar-icon gl-macbook-mock__menubar-icon--battery" />
                  <span className="gl-macbook-mock__menubar-time">9:41 AM</span>
                </div>
              </div>

              <div className="gl-macbook-mock__wallpaper">
                <div className="gl-macbook-mock__mesh" />

                <div className="gl-macbook-mock__browser">
                  <div className="gl-macbook-mock__browser-chrome">
                    <div className="gl-macbook-mock__browser-lights">
                      <span /><span /><span />
                    </div>
                    <div className="gl-macbook-mock__browser-toolbar">
                      <span className="gl-macbook-mock__browser-nav" />
                      <span className="gl-macbook-mock__browser-url">iivo.ai</span>
                    </div>
                  </div>

                  <div className="gl-macbook-mock__browser-tabs">
                    {BROWSER_TABS.map((tab) => (
                      <span
                        key={tab.label}
                        className={`gl-macbook-mock__browser-tab${tab.active ? " gl-macbook-mock__browser-tab--active" : ""}`}
                      >
                        <span className="gl-macbook-mock__browser-tab-favicon">G</span>
                        <span className="gl-macbook-mock__browser-tab-label">{tab.label}</span>
                      </span>
                    ))}
                    <span className="gl-macbook-mock__browser-tab gl-macbook-mock__browser-tab--new">+</span>
                  </div>

                  <div className="gl-macbook-mock__browser-page">
                    <div className="gl-macbook-mock__site-nav">
                      <span className="gl-macbook-mock__site-logo">IIVO</span>
                      <span className="gl-macbook-mock__site-link">Features</span>
                      <span className="gl-macbook-mock__site-link">Download</span>
                    </div>
                    <div className="gl-macbook-mock__site-hero">
                      <span className="gl-macbook-mock__site-pill">Ambient overlay</span>
                      <h2 className="gl-macbook-mock__site-title">IIVO Glass</h2>
                      <p className="gl-macbook-mock__site-lead">
                        AI-native ambient builder OS for your Mac
                      </p>
                      <div className="gl-macbook-mock__site-cta-row">
                        <span className="gl-macbook-mock__site-cta gl-macbook-mock__site-cta--primary">
                          Download
                        </span>
                        <span className="gl-macbook-mock__site-cta">Learn more</span>
                      </div>
                    </div>
                    <div className="gl-macbook-mock__site-cards">
                      <span className="gl-macbook-mock__site-card" />
                      <span className="gl-macbook-mock__site-card" />
                      <span className="gl-macbook-mock__site-card" />
                    </div>
                    <div className="gl-macbook-mock__site-footer-band" aria-hidden="true">
                      <span className="gl-macbook-mock__site-footer-line" />
                      <span className="gl-macbook-mock__site-footer-line gl-macbook-mock__site-footer-line--short" />
                    </div>
                  </div>
                </div>

                {/* Page continues behind the dock */}
                <div className="gl-macbook-mock__site-bleed" aria-hidden="true">
                  <div className="gl-macbook-mock__site-bleed-mesh" />
                  <div className="gl-macbook-mock__site-bleed-row">
                    <span className="gl-macbook-mock__site-bleed-card" />
                    <span className="gl-macbook-mock__site-bleed-card" />
                    <span className="gl-macbook-mock__site-bleed-card" />
                  </div>
                </div>
              </div>
            </div>

            {/* macOS Dock — above Glass chrome */}
            <div className="gl-macbook-mock__mac-dock-wrap">
              <div className="gl-macbook-mock__mac-dock">
                {MAC_DOCK_ICONS.map((icon, index) =>
                  "divider" in icon ? (
                    <span
                      key={`dock-divider-${index}`}
                      className="gl-macbook-mock__mac-dock-divider"
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      key={icon.label}
                      className={`gl-macbook-mock__mac-dock-icon gl-macbook-mock__mac-dock-icon--${icon.tone}${icon.active ? " gl-macbook-mock__mac-dock-icon--running" : ""}`}
                      title={icon.label}
                    />
                  ),
                )}
              </div>
              <div className="gl-macbook-mock__mac-dock-reflect" aria-hidden="true" />
            </div>

            {/* IIVO Glass overlay */}
            <div className="gl-macbook-mock__glass" aria-hidden="true">
              <div className="gl-macbook-mock__glass-frame">
                <span className="gl-macbook-mock__corner gl-macbook-mock__corner--tl" />
                <span className="gl-macbook-mock__corner gl-macbook-mock__corner--tr" />
                <span className="gl-macbook-mock__corner gl-macbook-mock__corner--bl" />
                <span className="gl-macbook-mock__corner gl-macbook-mock__corner--br" />
              </div>

              <div className="gl-macbook-mock__glass-rail">
                <div className="gl-macbook-mock__glass-rail-chrome">
                  <span className="gl-macbook-mock__glass-ring">G</span>
                  {GLASS_RAIL_ICONS.slice(1).map((icon) => (
                    <span key={icon} className="gl-macbook-mock__glass-rail-btn">
                      {icon}
                    </span>
                  ))}
                  <span className="gl-macbook-mock__glass-rail-led" />
                </div>
              </div>

              <div className="gl-macbook-mock__builder-strip">
                <div className="gl-macbook-mock__builder-group gl-macbook-mock__builder-group--left">
                  {BUILDER_LEFT_TABS.map((tab) => (
                    <span
                      key={tab.label}
                      className={`gl-macbook-mock__builder-tab gl-macbook-mock__builder-tab--${tab.kind}`}
                    >
                      <span className="gl-macbook-mock__builder-tab-icon" aria-hidden="true">
                        {tab.icon}
                      </span>
                      <span className="gl-macbook-mock__builder-tab-label">{tab.label}</span>
                    </span>
                  ))}
                </div>
                <span className="gl-macbook-mock__builder-divider" aria-hidden="true" />
                <div className="gl-macbook-mock__builder-group gl-macbook-mock__builder-group--right">
                  {BUILDER_RIGHT_TABS.map((tab) => (
                    <span
                      key={tab.label}
                      className={`gl-macbook-mock__builder-tab gl-macbook-mock__builder-tab--${tab.kind}${"active" in tab && tab.active ? " gl-macbook-mock__builder-tab--active" : ""}`}
                    >
                      {"icon" in tab ? (
                        <span className="gl-macbook-mock__builder-tab-icon" aria-hidden="true">
                          {tab.icon}
                        </span>
                      ) : null}
                      <span className="gl-macbook-mock__builder-tab-label">{tab.label}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="gl-macbook-mock__command-bar">
                <div className="gl-macbook-mock__composer gl-macbook-mock__composer--listening">
                  <div className="gl-macbook-mock__composer-main">
                    <span className="gl-macbook-mock__composer-mic" />
                    <span className="gl-macbook-mock__composer-input">Ask IIVO anything…</span>
                    <span className="gl-macbook-mock__composer-send">↑</span>
                  </div>
                  <span className="gl-macbook-mock__composer-led" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="gl-macbook-mock__chin" aria-hidden="true" />
      </div>
    </div>
  );
}
