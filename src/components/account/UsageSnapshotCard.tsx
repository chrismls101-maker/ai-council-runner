import type { JSX } from "react";

export type UsageSnapshot = {
  sessions?: number | null;
  commands?: number | null;
  overlayDemos?: number | null;
  estimatedAiSpend?: string | null;
};

type UsageSnapshotCardProps = {
  usage?: UsageSnapshot;
};

type StatProps = {
  label: string;
  value?: number | string | null;
};

function Stat({ label, value }: StatProps): JSX.Element {
  const display =
    value === undefined || value === null || value === ""
      ? "Coming soon"
      : String(value);

  return (
    <div className="glass-account-stat">
      <p className="glass-account-stat__label">{label}</p>
      <p className="glass-account-stat__value">{display}</p>
    </div>
  );
}

export default function UsageSnapshotCard({ usage }: UsageSnapshotCardProps): JSX.Element {
  return (
    <section className="glass-account-card">
      <h2 className="glass-account-card__title">Your Glass usage (last 7 days)</h2>
      <p className="glass-account-card__body glass-account-card__body--tight">
        A quick snapshot of activity on your linked Glass app.
      </p>
      <div className="glass-account-stats">
        <Stat label="Sessions" value={usage?.sessions} />
        <Stat label="Commands" value={usage?.commands} />
        <Stat label="Overlay demos" value={usage?.overlayDemos} />
        <Stat label="Estimated AI spend" value={usage?.estimatedAiSpend} />
      </div>
    </section>
  );
}
