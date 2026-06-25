import type { JSX } from "react";
import { formatRelativeTime } from "../../utils/relativeTime";

export type GlassStatus = {
  isLinked: boolean;
  lastSeen?: Date | string;
};

type AccountWelcomeCardProps = {
  name?: string | null;
  email: string;
  avatarLetter: string;
  glassStatus?: GlassStatus;
  showMacHint?: boolean;
};

function glassStatusLine(glassStatus?: GlassStatus): string {
  if (!glassStatus?.isLinked) return "Glass status: Not connected";
  if (glassStatus.lastSeen) {
    const rel = formatRelativeTime(glassStatus.lastSeen);
    return rel
      ? `Glass status: Connected · last seen ${rel}`
      : "Glass status: Connected";
  }
  return "Glass status: Connected";
}

export default function AccountWelcomeCard({
  name,
  email,
  avatarLetter,
  glassStatus,
  showMacHint = false,
}: AccountWelcomeCardProps): JSX.Element {
  const greeting = name?.trim() || email;

  return (
    <section className="glass-account-card">
      <div className="glass-account-welcome">
        <div className="glass-account-welcome__avatar" aria-hidden="true">
          {avatarLetter}
        </div>
        <div className="glass-account-welcome__body">
          <h2 className="glass-account-card__title">Hi, {greeting}</h2>
          <p className="glass-account-card__meta">{glassStatusLine(glassStatus)}</p>
          {name ? <p className="glass-account-card__email">{email}</p> : null}
          {showMacHint ? (
            <p className="glass-account-card__hint">
              You&apos;re on macOS. Glass runs natively on macOS.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
