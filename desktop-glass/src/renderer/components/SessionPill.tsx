import type { GlassSessionStatus } from "../../shared/sessionTypes.ts";

const LABELS: Record<GlassSessionStatus | "none", string> = {
  none: "Session idle",
  idle: "Session idle",
  active: "Session active",
  paused: "Session paused",
  ended: "Session ended",
};

const COMPACT_LABELS: Record<GlassSessionStatus | "none", string> = {
  none: "Idle",
  idle: "Idle",
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};

export function SessionPill({
  status,
  compact = false,
}: {
  status: GlassSessionStatus | null;
  compact?: boolean;
}): JSX.Element {
  const key = status ?? "none";
  const label = compact ? COMPACT_LABELS[key] : LABELS[key];
  return (
    <span
      className={`pill session-pill session-pill--${key}${compact ? " pill--compact" : ""}`}
      title={LABELS[key]}
    >
      <span className="pill__dot" />
      {label}
    </span>
  );
}
