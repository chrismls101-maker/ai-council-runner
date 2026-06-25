import { useEffect, useState, type JSX } from "react";
import { formatDatePretty, formatRelativeTime } from "../../utils/relativeTime";

export type ConnectStatus = "idle" | "generating" | "ready" | "error";

type GlassConnectionCardProps = {
  isLinked: boolean;
  linkedSince?: Date | string;
  lastSeen?: Date | string;
  connectStatus: ConnectStatus;
  connectToken: string;
  expiresAt?: Date;
  copied: boolean;
  onGenerateToken: () => void;
  onCopy: () => void;
  onResetToken: () => void;
  onDisconnect?: () => void;
};

function useCountdown(expiresAt?: Date): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setLabel(null);
      return;
    }

    function tick(): void {
      const remainingMs = expiresAt!.getTime() - Date.now();
      if (remainingMs <= 0) {
        setLabel("expired");
        return;
      }
      const totalSec = Math.ceil(remainingMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      setLabel(min > 0 ? `${min}m ${sec}s` : `${sec}s`);
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return label;
}

export default function GlassConnectionCard({
  isLinked,
  linkedSince,
  lastSeen,
  connectStatus,
  connectToken,
  expiresAt,
  copied,
  onGenerateToken,
  onCopy,
  onResetToken,
  onDisconnect,
}: GlassConnectionCardProps): JSX.Element {
  const countdown = useCountdown(expiresAt);

  if (isLinked) {
    const linkedPretty = linkedSince ? formatDatePretty(linkedSince) : null;
    const lastSeenPretty = lastSeen ? formatRelativeTime(lastSeen) : null;

    return (
      <section className="glass-account-card">
        <h2 className="glass-account-card__title">Glass is connected</h2>
        {linkedPretty ? (
          <p className="glass-account-card__body">Connected since {linkedPretty}.</p>
        ) : (
          <p className="glass-account-card__body">Your Glass app is linked to this account.</p>
        )}
        {lastSeenPretty ? (
          <p className="glass-account-card__body">Last seen {lastSeenPretty}.</p>
        ) : null}
        <div className="glass-account-card__actions">
          <a className="glass-account-btn glass-account-btn--primary" href="/dashboard">
            Open Glass Dashboard
          </a>
          {onDisconnect ? (
            <button
              type="button"
              className="glass-account-btn glass-account-btn--ghost"
              onClick={onDisconnect}
            >
              Disconnect Glass
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="glass-account-card">
      <h2 className="glass-account-card__title">Connect IIVO Glass to your account</h2>
      <p className="glass-account-card__body">
        Glass runs locally. Linking lets us show your usage and unlock future features like
        billing and founder tools.
      </p>
      <ol className="glass-account-steps">
        <li>Open Glass and go to Settings → Account.</li>
        <li>Click &ldquo;Generate connect token&rdquo; below.</li>
        <li>Paste the token into Glass.</li>
      </ol>

      {connectStatus === "idle" && (
        <button
          type="button"
          className="glass-account-btn glass-account-btn--primary"
          onClick={onGenerateToken}
        >
          Generate connect token
        </button>
      )}

      {connectStatus === "generating" && (
        <button type="button" className="glass-account-btn glass-account-btn--primary" disabled>
          Generating…
        </button>
      )}

      {connectStatus === "ready" && (
        <div className="glass-account-token">
          <code className="glass-account-token__code">{connectToken}</code>
          <div className="glass-account-token__row">
            <button
              type="button"
              className="glass-account-btn glass-account-btn--secondary"
              onClick={onCopy}
            >
              {copied ? "Copied!" : "Copy token"}
            </button>
          </div>
          <p className="glass-account-card__hint">
            Token expires in 5 minutes for your security.
            {countdown && countdown !== "expired" ? ` (${countdown} left)` : null}
            {countdown === "expired" ? " This token has expired." : null}
          </p>
          <button
            type="button"
            className="glass-account-btn glass-account-btn--ghost"
            onClick={onResetToken}
          >
            Generate a new token
          </button>
        </div>
      )}

      {connectStatus === "error" && (
        <div className="glass-account-token">
          <p className="glass-account-error">Failed to generate token. Please try again.</p>
          <button
            type="button"
            className="glass-account-btn glass-account-btn--primary"
            onClick={onResetToken}
          >
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
