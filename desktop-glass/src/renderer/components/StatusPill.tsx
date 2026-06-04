import type { GlassStatus } from "../../shared/types.ts";

const LABELS: Record<GlassStatus, string> = {
  idle: "IIVO idle",
  listening: "IIVO listening",
  capturing: "Capturing screen",
  sending: "Sending to IIVO",
  sent: "Sent to IIVO",
};

const COMPACT_LABELS: Record<GlassStatus, string> = {
  idle: "Idle",
  listening: "Listening",
  capturing: "Capturing",
  sending: "Sending",
  sent: "Sent",
};

export function StatusPill({
  status,
  compact = false,
}: {
  status: GlassStatus;
  compact?: boolean;
}): JSX.Element {
  const label = compact ? COMPACT_LABELS[status] : LABELS[status];
  return (
    <span className={`pill pill--${status}${compact ? " pill--compact" : ""}`} title={LABELS[status]}>
      <span className="pill__dot" />
      {label}
    </span>
  );
}
