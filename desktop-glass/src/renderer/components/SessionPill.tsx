import type { GlassSessionStatus } from "../../shared/sessionTypes.ts";

const LABELS: Record<GlassSessionStatus | "none", string> = {
  none: "Session idle",
  idle: "Session idle",
  active: "Session active",
  paused: "Session paused",
  ended: "Session ended",
};

export function SessionPill({ status }: { status: GlassSessionStatus | null }): JSX.Element {
  const key = status ?? "none";
  return (
    <span className={`pill session-pill session-pill--${key}`} title={LABELS[key]}>
      <span className="pill__dot" />
      {LABELS[key]}
    </span>
  );
}
