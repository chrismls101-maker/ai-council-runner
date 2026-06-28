import type { CSSProperties, JSX } from "react";

const LAYERS = [
  {
    id: "council",
    label: "Council & memory",
    detail: "Multi-agent reasoning and memory that compounds across every app you work in — not one chat thread.",
  },
  {
    id: "builder",
    label: "Builder strip",
    detail: "Terminal, Aletheia, agents, and powers menu — one strip orchestrating your entire desktop.",
  },
  {
    id: "ambient",
    label: "Intelligent glass",
    detail: "Transparent layer above macOS — sees, hears, and acts across all apps without trapping you in a tab.",
  },
  {
    id: "desktop",
    label: "Your apps",
    detail: "Figma, Xcode, Safari, Slack — untouched underneath. Intelligence on top. That's the whole point.",
  },
] as const;

export default function AmbientOsStack(): JSX.Element {
  return (
    <div className="gl-os-stack" aria-label="IIVO Glass operating system layers">
      {LAYERS.map((layer, index) => (
        <div
          key={layer.id}
          className="gl-os-stack__layer gl-surface"
          style={{ "--layer-index": index } as CSSProperties}
        >
          <div className="gl-os-stack__layer-head">
            <span className="gl-os-stack__layer-index">L{LAYERS.length - index}</span>
            <span className="gl-os-stack__layer-label">{layer.label}</span>
          </div>
          <p className="gl-os-stack__layer-detail">{layer.detail}</p>
        </div>
      ))}
    </div>
  );
}
