import type { CoderRunUsage } from "../../shared/coderAgentModels.ts";
import { formatCoderRunUsageLine } from "../../shared/coderAgentModels.ts";

interface GlassIdeCostFooterProps {
  usage: CoderRunUsage | null | undefined;
  agentRunning: boolean;
}

export function GlassIdeCostFooter({
  usage,
  agentRunning,
}: GlassIdeCostFooterProps): JSX.Element {
  const line = usage
    ? formatCoderRunUsageLine(usage)
    : agentRunning
      ? "Measuring token usage…"
      : "Run Glass Coder to see token usage and estimated cost";

  return (
    <footer
      className={`gide-cost-footer${usage ? " gide-cost-footer--active" : ""}${agentRunning ? " gide-cost-footer--live" : ""}`}
      data-testid="glass-ide-cost-footer"
      aria-live="polite"
    >
      <span className="gide-cost-footer__label">This run</span>
      <span className="gide-cost-footer__value">{line}</span>
    </footer>
  );
}
