import type { CSSProperties, JSX } from "react";

const LAYERS = [
  {
    id: "council",
    label: "Council & memory",
    detail: "Multi-agent reasoning, session memory, and decisions that persist across your work.",
  },
  {
    id: "builder",
    label: "Builder strip",
    detail: "Agents, terminal, powers menu, and command palette — one orchestration surface.",
  },
  {
    id: "ambient",
    label: "Ambient overlay",
    detail: "Always-on-top glass layer that listens, sees, and translates without stealing focus.",
  },
  {
    id: "desktop",
    label: "Your desktop",
    detail: "Every app, browser tab, and workflow you already use — untouched underneath.",
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
