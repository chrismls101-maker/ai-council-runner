import { useCallback, useEffect, useState, type JSX } from "react";
import { GLASS_DMG_ARM64_DOWNLOAD_URL } from "../../utils/glassRelease";
import { useGlassBrowse } from "./glassBrowseMode";
import { useGlassCinematicIntro } from "./glassCinematicIntro";

type DockApp =
  | {
      id: string;
      label: string;
      tone: string;
      href: string;
      external?: boolean;
    }
  | {
      id: string;
      label: string;
      tone: string;
      decorative: true;
      running?: boolean;
    }
  | {
      id: string;
      label: string;
      tone: string;
      action: "glass";
    };

const DOCK_APPS: DockApp[] = [
  { id: "finder", label: "Finder", tone: "finder", decorative: true },
  { id: "safari", label: "Safari", tone: "safari", decorative: true, running: true },
  { id: "mail", label: "Mail", tone: "mail", decorative: true },
  { id: "messages", label: "Messages", tone: "messages", decorative: true },
  { id: "maps", label: "Maps", tone: "maps", decorative: true },
  { id: "photos", label: "Photos", tone: "photos", decorative: true },
  { id: "facetime", label: "FaceTime", tone: "facetime", decorative: true },
  { id: "calendar", label: "Calendar", tone: "calendar", decorative: true },
  { id: "music", label: "Music", tone: "music", decorative: true },
  { id: "notes", label: "Notes", tone: "notes", decorative: true },
  { id: "settings", label: "Settings", tone: "settings", decorative: true },
  { id: "appstore", label: "App Store", tone: "appstore", decorative: true },
  { id: "glass", label: "IIVO Glass", tone: "glass", action: "glass" },
  { id: "home", label: "Home", tone: "home", href: "#hero" },
  { id: "ambient", label: "The layer", tone: "ambient", href: "#ambient-os" },
  { id: "builder", label: "Capabilities", tone: "builder", href: "#builder-stack" },
  { id: "trust", label: "Trust", tone: "trust", href: "#trust" },
  { id: "cursor", label: "Cursor", tone: "cursor", decorative: true, running: true },
  { id: "terminal", label: "Terminal", tone: "terminal", decorative: true },
  { id: "slack", label: "Slack", tone: "slack", decorative: true },
  { id: "chrome", label: "Chrome", tone: "chrome", decorative: true },
  { id: "download", label: "Download", tone: "download", href: GLASS_DMG_ARM64_DOWNLOAD_URL, external: true },
  { id: "install", label: "Install", tone: "install", href: "/install" },
  { id: "signin", label: "Sign in", tone: "signin", href: "/login" },
];

const MINIMIZED_WINDOWS = [
  { id: "win-iivo", label: "IIVO Glass — iivo.ai", variant: "iivo" },
  { id: "win-docs", label: "Glass Docs", variant: "docs" },
  { id: "win-github", label: "GitHub · iivo-ai/glass", variant: "github" },
] as const;

function sectionForHref(href: string): string | null {
  if (!href.startsWith("#")) return null;
  return href.slice(1);
}

function renderDockApp(
  item: DockApp,
  opts: {
    activeSection: string;
    glassRunning: boolean;
    onClick: (item: DockApp) => void;
  },
): JSX.Element {
  const section = "href" in item ? sectionForHref(item.href) : null;
  const isRunning =
    ("action" in item && item.action === "glass" && opts.glassRunning) ||
    ("decorative" in item && item.running) ||
    (section != null && opts.activeSection === section);

  if ("decorative" in item) {
    return (
      <button
        key={item.id}
        type="button"
        className={[
          "glass-site-dock__icon",
          "glass-site-dock__icon--decorative",
          `glass-site-dock__icon--${item.tone}`,
          isRunning ? "glass-site-dock__icon--running" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={item.label}
        aria-label={item.label}
        tabIndex={-1}
      />
    );
  }

  if ("action" in item) {
    return (
      <button
        key={item.id}
        type="button"
        className={[
          "glass-site-dock__icon",
          `glass-site-dock__icon--${item.tone}`,
          isRunning ? "glass-site-dock__icon--running" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={item.label}
        aria-label={item.label}
        aria-pressed={opts.glassRunning}
        onClick={() => opts.onClick(item)}
      />
    );
  }

  const className = [
    "glass-site-dock__icon",
    `glass-site-dock__icon--${item.tone}`,
    isRunning ? "glass-site-dock__icon--running" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (item.external || !item.href.startsWith("#")) {
    return (
      <a
        key={item.id}
        href={item.href}
        className={className}
        title={item.label}
        aria-label={item.label}
        {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      />
    );
  }

  return (
    <a
      key={item.id}
      href={item.href}
      className={className}
      title={item.label}
      aria-label={item.label}
      onClick={(event) => {
        event.preventDefault();
        opts.onClick(item);
      }}
    />
  );
}

/** Sticky macOS-style dock — apps, minimized windows, trash. */
export default function GlassLandingSiteDock({
  decorative = false,
}: {
  decorative?: boolean;
}): JSX.Element {
  const intro = useGlassCinematicIntro();
  const { enter, exit, active, exiting } = useGlassBrowse();
  const [activeSection, setActiveSection] = useState("hero");
  const glassRunning = active || exiting;

  const visible =
    decorative || !intro.enabled || intro.complete || intro.phase === "boot";

  useEffect(() => {
    if (decorative) return;
    const sections = ["hero", "ambient-os", "builder-stack", "trust"];
    const elements = sections
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el instanceof HTMLElement);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visibleEntry?.target.id) setActiveSection(visibleEntry.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.12, 0.35, 0.6] },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleClick = useCallback(
    (item: DockApp): void => {
      if (decorative) return;
      if ("decorative" in item) return;
      if ("action" in item && item.action === "glass") {
        if (glassRunning) {
          exit("manual_button");
        } else {
          enter();
        }
        return;
      }
      if ("href" in item) {
        const section = sectionForHref(item.href);
        if (section) {
          document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    },
    [decorative, enter, exit, glassRunning],
  );

  const appOpts = { activeSection, glassRunning, onClick: handleClick };

  return (
    <div
      className={[
        "glass-site-dock",
        visible ? "glass-site-dock--visible" : "",
        decorative ? "glass-site-dock--decorative" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={decorative ? "glass-site-dock-decorative" : "glass-site-dock"}
      aria-hidden={decorative || !visible}
    >
      <div className="glass-site-dock__wrap">
        <nav className="glass-site-dock__bar" aria-label="Site dock">
          <div className="glass-site-dock__apps">
            {DOCK_APPS.map((item) => renderDockApp(item, appOpts))}
          </div>

          <div className="glass-site-dock__tail">
            <div className="glass-site-dock__minimized" aria-label="Minimized windows">
              {MINIMIZED_WINDOWS.map((win) => (
                <button
                  key={win.id}
                  type="button"
                  className={[
                    "glass-site-dock__minimized-window",
                    `glass-site-dock__minimized-window--${win.variant}`,
                  ].join(" ")}
                  title={win.label}
                  aria-label={`${win.label} (minimized)`}
                  tabIndex={-1}
                />
              ))}
            </div>

            <span className="glass-site-dock__divider" aria-hidden="true" />

            <button
              type="button"
              className="glass-site-dock__trash"
              title="Trash"
              aria-label="Trash"
              tabIndex={-1}
            />
          </div>
        </nav>
        <div className="glass-site-dock__reflect" aria-hidden="true" />
      </div>
    </div>
  );
}
