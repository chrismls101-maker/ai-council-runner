import type { JSX } from "react";

const DOCK_ICONS = [
  { tone: "finder", active: false, target: "finder" as const },
  { tone: "safari", active: false, target: "safari" as const },
  { tone: "mail", active: false },
  { tone: "messages", active: false },
  { tone: "glass", active: false, target: "glass" as const },
  { tone: "terminal", active: false, target: "terminal" as const },
  { divider: true as const },
  { tone: "cursor", active: true },
  { tone: "slack", active: false },
  { tone: "trash", active: false },
] as const;

const DOCK_WORD_LEFT = "INTELLIGENT";
const DOCK_WORD_RIGHT = "GLASS";

function DockLetterIcon({ char, side, index }: { char: string; side: "left" | "right"; index: number }): JSX.Element {
  return (
    <span
      className={`glass-landing__desktop-dock-letter glass-landing__desktop-dock-letter--${side}`}
      style={{ animationDelay: `${index * 40}ms` }}
      aria-hidden="true"
    >
      {char}
    </span>
  );
}

/** Scene macOS dock — letter icons flank app icons in one row. */
export default function GlassLandingDesktopDock({
  wrapClassName = "glass-landing__desktop-dock-wrap--scene",
}: {
  wrapClassName?: string;
}): JSX.Element {
  return (
    <div className={["glass-landing__desktop-dock-wrap", wrapClassName].filter(Boolean).join(" ")}>
      <div className="glass-landing__desktop-dock">
        <div className="glass-landing__desktop-dock-apps">
          {DOCK_WORD_LEFT.split("").map((char, index) => (
            <DockLetterIcon key={`L-${char}-${index}`} char={char} side="left" index={index} />
          ))}

          <span className="glass-landing__desktop-dock-word-gap" aria-hidden="true" />

          <div className="glass-landing__desktop-dock-icons">
            {DOCK_ICONS.map((icon, index) =>
              "divider" in icon ? (
                <span key={`dock-div-${index}`} className="glass-landing__desktop-dock-divider" />
              ) : (
                <span
                  key={icon.tone}
                  data-dock-target={"target" in icon ? icon.target : undefined}
                  className={[
                    "glass-landing__desktop-dock-icon",
                    `glass-landing__desktop-dock-icon--${icon.tone}`,
                    icon.active ? "glass-landing__desktop-dock-icon--running" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ),
            )}
          </div>

          <span className="glass-landing__desktop-dock-word-gap" aria-hidden="true" />

          {DOCK_WORD_RIGHT.split("").map((char, index) => (
            <DockLetterIcon key={`R-${char}-${index}`} char={char} side="right" index={index} />
          ))}
        </div>
      </div>
      <div className="glass-landing__desktop-dock-reflect" />
    </div>
  );
}
