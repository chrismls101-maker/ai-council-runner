import type { Ref } from "react";

/** Drag surface + hint while dock or command bar layout is unlocked for repositioning. */
export function ChromeRepositionOverlay({
  surfaceRef,
}: {
  surfaceRef: Ref<HTMLDivElement>;
}): JSX.Element {
  return (
    <div ref={surfaceRef} className="chrome-reposition" role="status" aria-live="polite">
      <span className="chrome-reposition__hint">Hold & drag to move</span>
    </div>
  );
}
