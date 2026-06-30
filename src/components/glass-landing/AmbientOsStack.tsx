import type { CSSProperties, JSX } from "react";

const LAYERS = [
  {
    id: "council",
    label: "Council & memory",
    detail: "Multi-agent reasoning and memory that compounds across every app — not one chat thread.",
    tone: "council",
  },
  {
    id: "builder",
    label: "Builder strip",
    detail: "Terminal, Aletheia, agents, and powers — one strip orchestrating your entire desktop.",
    tone: "builder",
  },
  {
    id: "ambient",
    label: "Intelligent glass",
    detail: "Transparent layer above macOS — sees, hears, and acts across all apps without trapping you in a tab.",
    tone: "glass",
    highlight: true,
  },
  {
    id: "desktop",
    label: "Your apps",
    detail: "Figma, Xcode, Safari, Slack — untouched underneath. Intelligence on top.",
    tone: "desktop",
  },
] as const;

export default function AmbientOsStack(): JSX.Element {
  return (
    <div className="gl-os-stack gl-os-stack--arch" aria-label="IIVO Glass operating system layers">
      <div className="gl-os-stack__axis" aria-hidden="true">
        <span className="gl-os-stack__axis-label">Elevation</span>
        <span className="gl-os-stack__axis-line" />
      </div>

      <div className="gl-os-stack__deck">
        {LAYERS.map((layer, index) => (
          <div
            key={layer.id}
            className={[
              "gl-os-stack__layer",
              "highlight" in layer && layer.highlight === true ? "gl-os-stack__layer--glass" : "",
              `gl-os-stack__layer--${layer.tone}`,
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ "--layer-index": index, "--layer-z": LAYERS.length - index } as CSSProperties}
          >
            <div className="gl-os-stack__layer-edge" aria-hidden="true" />
            <div className="gl-os-stack__layer-surface">
              <div className="gl-os-stack__layer-head">
                <span className="gl-os-stack__layer-index">L{LAYERS.length - index}</span>
                <span className="gl-os-stack__layer-label">{layer.label}</span>
                {"highlight" in layer && layer.highlight === true ? (
                  <span className="gl-os-stack__layer-live">
                    <span className="gl-os-stack__layer-live-dot" />
                    Live
                  </span>
                ) : null}
              </div>
              <p className="gl-os-stack__layer-detail">{layer.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
