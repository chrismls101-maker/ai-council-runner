import { useCallback, useEffect, useState, type JSX } from "react";
import { GLASS_DMG_ARM64_DOWNLOAD_URL } from "../../utils/glassRelease";
import { useGlassBrowse } from "./glassBrowseMode";
import { useGlassCinematicIntro } from "./glassCinematicIntro";

type DockItem =
  | {
      id: string;
      label: string;
      tone: string;
      href: string;
      external?: boolean;
      running?: boolean;
    }
  | {
      id: string;
      label: string;
      tone: string;
      placeholder: true;
    }
  | {
      id: string;
      label: string;
      tone: string;
      action: "glass";
    };

const DOCK_ITEMS: DockItem[] = [
  { id: "home", label: "Home", tone: "home", href: "#hero" },
  { id: "ambient", label: "The layer", tone: "ambient", href: "#ambient-os" },
  { id: "builder", label: "Capabilities", tone: "builder", href: "#builder-stack" },
  { id: "trust", label: "Trust", tone: "trust", href: "#trust" },
  { id: "glass", label: "Glass", tone: "glass", action: "glass" },
  { id: "download", label: "Download", tone: "download", href: GLASS_DMG_ARM64_DOWNLOAD_URL, external: true },
  { id: "signin", label: "Sign in", tone: "signin", href: "/login" },
  { id: "council", label: "Council", tone: "council", placeholder: true },
  { id: "memory", label: "Memory", tone: "memory", placeholder: true },
  { id: "docs", label: "Docs", tone: "docs", placeholder: true },
  { id: "install", label: "Install", tone: "install", href: "/install" },
];

function sectionForHref(href: string): string | null {
  if (!href.startsWith("#")) return null;
  return href.slice(1);
}

/** Sticky macOS-style dock — site nav + placeholder apps for future pages. */
export default function GlassLandingSiteDock(): JSX.Element {
  const intro = useGlassCinematicIntro();
  const { enter, active, exiting } = useGlassBrowse();
  const [activeSection, setActiveSection] = useState("hero");
  const glassRunning = active || exiting;

  const visible = !intro.enabled || intro.complete;

  useEffect(() => {
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
    (item: DockItem): void => {
      if ("placeholder" in item) return;
      if ("action" in item && item.action === "glass") {
        if (!glassRunning) enter();
        return;
      }
      if ("href" in item) {
        const section = sectionForHref(item.href);
        if (section) {
          document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    },
    [enter, glassRunning],
  );

  return (
    <div
      className={`glass-site-dock${visible ? " glass-site-dock--visible" : ""}`}
      data-testid="glass-site-dock"
      aria-hidden={!visible}
    >
      <div className="glass-site-dock__wrap">
        <nav className="glass-site-dock__bar" aria-label="Site dock">
          {DOCK_ITEMS.map((item) => {
            const section = "href" in item ? sectionForHref(item.href) : null;
            const isRunning =
              ("action" in item && item.action === "glass" && glassRunning) ||
              (section != null && activeSection === section && !("placeholder" in item));

            if ("placeholder" in item) {
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`glass-site-dock__icon glass-site-dock__icon--${item.tone} glass-site-dock__icon--placeholder`}
                  title={`${item.label} — coming soon`}
                  aria-label={`${item.label} — coming soon`}
                  disabled
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
                  aria-pressed={glassRunning}
                  onClick={() => handleClick(item)}
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
                  handleClick(item);
                }}
              />
            );
          })}
        </nav>
        <div className="glass-site-dock__reflect" aria-hidden="true" />
      </div>
    </div>
  );
}
