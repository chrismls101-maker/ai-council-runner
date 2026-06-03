import type { GlassStatus } from "../../shared/types.ts";

const LABELS: Record<GlassStatus, string> = {
  idle: "IIVO idle",
  listening: "IIVO listening",
  capturing: "Capturing screen",
  sending: "Sending to IIVO",
  sent: "Sent to IIVO",
};

export function StatusPill({ status }: { status: GlassStatus }): JSX.Element {
  return (
    <span className={`pill pill--${status}`} title={LABELS[status]}>
      <span className="pill__dot" />
      {LABELS[status]}
    </span>
  );
}
