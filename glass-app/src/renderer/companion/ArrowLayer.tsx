import type { ScreenRect } from "../../shared/companionGuidance.ts";

export function ArrowLayer({
  from,
  to,
}: {
  from: ScreenRect;
  to: ScreenRect;
}): JSX.Element {
  const x1 = from.left + from.width / 2;
  const y1 = from.top + from.height / 2;
  const x2 = to.left + to.width / 2;
  const y2 = to.top + to.height / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  return (
    <svg
      className="companion-presence__arrow"
      style={{ left: 0, top: 0, width: "100%", height: "100%" }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="companion-arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="rgba(56, 189, 248, 0.95)" />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        className="companion-presence__arrow-line"
        strokeDasharray={length}
        strokeDashoffset={length}
        markerEnd="url(#companion-arrowhead)"
      />
    </svg>
  );
}
