import type { GlassState } from "../../shared/ipc.ts";
import { AletheiaComputerGrantCard } from "./AletheiaComputerGrantCard.tsx";
import { AletheiaComputerLiveAudit } from "./AletheiaComputerLiveAudit.tsx";

interface AletheiaComputerSessionPanelProps {
  operator: NonNullable<GlassState["aletheiaComputerOperator"]>;
  variant: "inline" | "slide";
  lastPrompt?: string;
  onDismiss?: () => void;
}

export function AletheiaComputerSessionPanel({
  operator,
  variant,
  lastPrompt,
  onDismiss,
}: AletheiaComputerSessionPanelProps): JSX.Element | null {
  const awaitingGrant =
    operator.phase === "awaiting_grant" || operator.phase === "awaiting_confirm";

  if (awaitingGrant) {
    return (
      <AletheiaComputerGrantCard
        operator={operator}
        variant={variant}
        lastPrompt={lastPrompt}
        onDismiss={onDismiss}
      />
    );
  }

  return <AletheiaComputerLiveAudit operator={operator} variant={variant} />;
}
