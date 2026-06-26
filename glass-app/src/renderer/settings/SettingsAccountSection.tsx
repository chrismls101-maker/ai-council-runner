import { useEffect, useState, type ReactNode } from "react";
import { Link2, UserCircle } from "lucide-react";
import type { GlassState } from "../../shared/ipc.ts";
import { send } from "../useGlassState.ts";
import { ProfileEditor } from "../panel/PanelSetupSections.tsx";

type CardStatus = "ok" | "warn" | "idle" | "error";

function statusLabel(status: CardStatus): string {
  if (status === "ok") return "Connected";
  if (status === "warn") return "Action needed";
  if (status === "error") return "Issue";
  return "Not connected";
}

function AccountPipelineCard({
  step,
  title,
  summary,
  status,
  icon,
  children,
  testId,
}: {
  step: string;
  title: string;
  summary: string;
  status: CardStatus;
  icon: JSX.Element;
  children: ReactNode;
  testId: string;
}): JSX.Element {
  return (
    <article className="glass-settings__audio-card" data-testid={testId}>
      <div className="glass-settings__audio-card-head">
        <span className="glass-settings__audio-step">{step}</span>
        <span className={`glass-settings__audio-status glass-settings__audio-status--${status}`}>
          {statusLabel(status)}
        </span>
      </div>
      <div className="glass-settings__audio-card-main">
        <span className="glass-settings__audio-icon">{icon}</span>
        <div className="glass-settings__audio-copy">
          <h3 className="glass-settings__audio-title">{title}</h3>
          <p className="glass-settings__audio-summary">{summary}</p>
        </div>
      </div>
      <div className="glass-settings__audio-card-body">{children}</div>
    </article>
  );
}

type SettingsAccountSectionProps = {
  state: GlassState;
};

export function SettingsAccountSection({ state }: SettingsAccountSectionProps): JSX.Element {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const linked = state.iivoAccountLink;

  useEffect(() => {
    if (busy && linked) setBusy(false);
  }, [busy, linked]);

  const handleConnect = (): void => {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    send({ type: "connect-iivo-account", connectToken: t });
    setToken("");
  };

  return (
    <div className="glass-settings__account" data-testid="glass-settings-account">
      <p className="glass-settings__audio-lede">
        Link Glass to <strong>iivo.ai</strong> so sessions can sync, then set your profile so IIVO
        calibrates responses to your work.
      </p>

      <AccountPipelineCard
        step="1"
        title="IIVO account"
        summary={
          linked
            ? `Signed in as ${linked.email} — session data can sync with iivo.ai.`
            : "Connect with a one-time token from iivo.ai/account."
        }
        status={linked ? "ok" : "warn"}
        icon={<Link2 size={26} strokeWidth={1.75} />}
        testId="glass-settings-account-link"
      >
        {linked ? (
          <>
            <div className="glass-settings__account-connected">
              <span className="glass-settings__account-avatar" aria-hidden="true">
                {(linked.name ?? linked.email)[0]?.toUpperCase() ?? "?"}
              </span>
              <div>
                {linked.name ? (
                  <p className="glass-settings__account-name">{linked.name}</p>
                ) : null}
                <p className="glass-settings__account-email">{linked.email}</p>
                <p className="glass-settings__block-hint">
                  Connected {new Date(linked.linkedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="glass-settings__audio-actions">
              <button
                type="button"
                className="gbtn gbtn--danger"
                data-testid="glass-settings-account-disconnect"
                onClick={() => send({ type: "disconnect-iivo-account" })}
              >
                Disconnect account
              </button>
            </div>
          </>
        ) : (
          <>
            <ol className="glass-settings__account-steps">
              <li>
                Sign in at{" "}
                <button
                  type="button"
                  className="glass-settings__inline-link"
                  onClick={() => void window.glass.settingsOpenExternal("https://iivo.ai/account")}
                >
                  iivo.ai/account
                </button>
              </li>
              <li>Click &quot;Generate connect token&quot;</li>
              <li>Paste the token below</li>
            </ol>
            <label className="glass-settings__audio-field">
              <span>Connect token</span>
              <input
                className="glass-settings__providers-input"
                type="text"
                placeholder="Paste connect token…"
                value={token}
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
                data-testid="glass-settings-account-token"
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConnect();
                }}
              />
            </label>
            <div className="glass-settings__audio-actions">
              <button
                type="button"
                className="gbtn gbtn--primary"
                data-testid="glass-settings-account-connect"
                disabled={busy || !token.trim()}
                onClick={handleConnect}
              >
                {busy ? "Connecting…" : "Connect account"}
              </button>
            </div>
          </>
        )}
      </AccountPipelineCard>

      <AccountPipelineCard
        step="2"
        title="Your profile"
        summary="Name, work focus, and persona — used to personalize IIVO responses."
        status={state.glassUserProfile?.name?.trim() ? "ok" : "idle"}
        icon={<UserCircle size={26} strokeWidth={1.75} />}
        testId="glass-settings-account-profile"
      >
        <ProfileEditor state={state} />
      </AccountPipelineCard>
    </div>
  );
}
