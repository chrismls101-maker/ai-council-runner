import { useState, type JSX } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import { send } from "../useGlassState.ts";

interface AccountTabProps {
  state: GlassState;
}

export default function AccountTab({ state }: AccountTabProps): JSX.Element {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = state.iivoAccountLink;

  async function handleConnect() {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    send({ type: "connect-iivo-account", connectToken: t });
    // Reset after a short delay; IPC is fire-and-forget, error surfaces via state
    await new Promise((r) => setTimeout(r, 2000));
    setBusy(false);
    setToken("");
  }

  function handleDisconnect() {
    send({ type: "disconnect-iivo-account" });
    setError(null);
  }

  if (linked) {
    return (
      <div className="account-tab">
        <div className="account-tab__connected">
          <div className="account-tab__avatar" aria-hidden>
            {(linked.name ?? linked.email)[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="account-tab__info">
            {linked.name && <p className="account-tab__name">{linked.name}</p>}
            <p className="account-tab__email">{linked.email}</p>
            <p className="account-tab__since">
              Connected {new Date(linked.linkedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <p className="account-tab__hint">
          Glass is linked to your IIVO account. Your session data can sync with iivo.ai.
        </p>

        <button className="gbtn gbtn--danger account-tab__disconnect" onClick={handleDisconnect}>
          Disconnect account
        </button>
      </div>
    );
  }

  return (
    <div className="account-tab">
      <h3 className="account-tab__title">Connect your IIVO account</h3>
      <p className="account-tab__hint">
        Link Glass to your iivo.ai account so your sessions can sync.
      </p>

      <ol className="account-tab__steps">
        <li>
          Sign in at{" "}
          <a
            href="#"
            className="account-tab__link"
            onClick={(e) => {
              e.preventDefault();
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { shell } = require("electron");
              shell.openExternal("https://iivo.ai/account");
            }}
          >
            iivo.ai/account
          </a>
        </li>
        <li>Click "Generate connect token"</li>
        <li>Paste the token below</li>
      </ol>

      <div className="account-tab__form">
        <input
          className="account-tab__input"
          type="text"
          placeholder="Paste connect token…"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConnect();
          }}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          className="gbtn gbtn--primary account-tab__connect"
          onClick={handleConnect}
          disabled={busy || !token.trim()}
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>

      {error && <p className="account-tab__error">{error}</p>}
    </div>
  );
}
