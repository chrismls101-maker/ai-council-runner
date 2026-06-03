import type { UsageSummaryResponse } from "../types/usage";
import { formatCredits } from "../utils/usageApi";

interface UsageIndicatorProps {
  usage: UsageSummaryResponse | null;
  onClick?: () => void;
}

export default function UsageIndicator({ usage, onClick }: UsageIndicatorProps) {
  if (!usage) return null;

  const low = usage.currentCredits < 20;

  return (
    <button
      type="button"
      className={`usage-indicator${low ? " is-low" : ""}`}
      onClick={onClick}
      data-testid="usage-indicator"
      title="Usage & credits"
    >
      <span className="usage-indicator-label">Credits</span>
      <span className="usage-indicator-value">
        {usage.currentCredits} / {usage.monthlyCredits}
      </span>
    </button>
  );
}

export function ComposerCreditHint({
  estimateLabel,
}: {
  estimateLabel: string | null;
}) {
  if (!estimateLabel) return null;
  return (
    <span className="composer-credit-hint" data-testid="composer-credit-estimate">
      {estimateLabel}
    </span>
  );
}

export function formatEstimateLabel(estimatedCredits: number, workflowId: string): string {
  const name =
    workflowId === "direct_answer"
      ? "Direct Answer"
      : workflowId
          .split("-")
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ");
  return `${name}: ${formatCredits(estimatedCredits)}`;
}
