import { useEffect, useState } from "react";
import type { ScreenRect } from "../../shared/companionGuidance.ts";
import { AletheiaGhostCursor } from "../shared/AletheiaGhostCursor.tsx";

export function PathAnimation({
  from,
  to,
}: {
  from: ScreenRect;
  to: ScreenRect;
}): JSX.Element {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 1800;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from.left, from.top, to.left, to.top]);

  const x1 = from.left + from.width / 2;
  const y1 = from.top + from.height / 2;
  const x2 = to.left + to.width / 2;
  const y2 = to.top + to.height / 2;
  const cx = x1 + (x2 - x1) * progress;
  const cy = y1 + (y2 - y1) * progress;

  return (
    <>
      <svg
        className="companion-presence__path-track"
        style={{ left: 0, top: 0, width: "100%", height: "100%" }}
        aria-hidden="true"
      >
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="companion-presence__path-line" />
      </svg>
      <AletheiaGhostCursor
        x={cx}
        y={cy}
        phase={progress >= 0.98 ? "click" : "approach"}
        testId="companion-path-dot"
      />
    </>
  );
}
