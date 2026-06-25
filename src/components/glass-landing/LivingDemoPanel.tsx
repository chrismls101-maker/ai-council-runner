import type { JSX } from "react";
import { useScrollReveal } from "./useScrollReveal.ts";
import { useTypewriter } from "./useTypewriter.ts";

const TERMINAL_LINES = [
  "$ glass terminal --autofix",
  "scanning src/main/index.ts…",
  "found: unused import 'path'",
  "applying patch… done",
  "running tsc --noEmit… ok",
] as const;

const FULL_TERMINAL = TERMINAL_LINES.join("\n");

export default function LivingDemoPanel(): JSX.Element {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();
  const typed = useTypewriter(FULL_TERMINAL, visible, 22);

  return (
    <div ref={ref} className="gl-living-demo gl-surface" data-testid="glass-living-demo">
      <div className="gl-living-demo__chrome">
        <span className="gl-living-demo__label">TERMINAL</span>
        <span className="gl-living-demo__live">
          <span className="gl-living-demo__live-dot" aria-hidden="true" />
          auto-fix
        </span>
      </div>
      <pre className="gl-living-demo__terminal">
        <code>{typed}</code>
        <span className="gl-living-demo__cursor" aria-hidden="true" />
      </pre>
    </div>
  );
}
