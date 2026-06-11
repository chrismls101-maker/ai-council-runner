/**
 * AccountPage.tsx — User account dashboard
 *
 * Shows: user info, Glass connection button (issues connect token),
 * sign-out button.
 */

import { useState, useEffect } from "react";
import { createAuthClient } from "better-auth/client";

const authClient = createAuthClient({
  baseURL: window.location.origin,
});

type ConnectStatus = "idle" | "generating" | "ready" | "error";

export default function AccountPage() {
  const [user, setUser] = useState<{ name?: string | null; email: string; image?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle");
  const [connectToken, setConnectToken] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void authClient.getSession().then((res) => {
      setUser(res?.data?.user ?? null);
      setLoading(false);
      if (!res?.data?.user) {
        window.location.href = "/login?redirect=/account";
      }
    });
  }, []);

  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = "/";
  }

  async function handleGenerateToken() {
    setConnectStatus("generating");
    setCopied(false);
    try {
      const res = await fetch("/api/auth/glass-connect/issue", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { connectToken: string };
      setConnectToken(data.connectToken);
      setConnectStatus("ready");
    } catch (err) {
      console.error(err);
      setConnectStatus("error");
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(connectToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="account-loading">
        <div className="account-spinner" />
      </div>
    );
  }

  if (!user) return null;

  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();

  return (
    <div className="account-page">
      <div className="account-container">
        {/* Header */}
        <div className="account-header">
          <span className="account-logo">IIVO</span>
          <button className="account-signout" onClick={() => { void handleSignOut(); }}>
            Sign out
          </button>
        </div>

        {/* Profile card */}
        <div className="account-card">
          <div className="account-avatar">{initials}</div>
          <div className="account-info">
            {user.name && <p className="account-name">{user.name}</p>}
            <p className="account-email">{user.email}</p>
          </div>
        </div>

        {/* Glass connection */}
        <div className="account-section">
          <h2 className="account-section__title">Connect IIVO Glass</h2>
          <p className="account-section__desc">
            Link your Glass app to this account. Open IIVO Glass → Settings → Account,
            then paste the token below.
          </p>

          {connectStatus === "idle" && (
            <button
              className="account-btn account-btn--primary"
              onClick={() => { void handleGenerateToken(); }}
            >
              Generate connect token
            </button>
          )}

          {connectStatus === "generating" && (
            <button className="account-btn account-btn--primary" disabled>
              Generating…
            </button>
          )}

          {connectStatus === "ready" && (
            <div className="account-token">
              <code className="account-token__code">{connectToken}</code>
              <button
                className="account-btn account-btn--copy"
                onClick={() => { void handleCopy(); }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <p className="account-token__hint">
                This token expires in 5 minutes. Paste it into IIVO Glass → Settings → Account.
              </p>
              <button
                className="account-btn account-btn--ghost"
                onClick={() => { setConnectStatus("idle"); setConnectToken(""); }}
              >
                Generate a new token
              </button>
            </div>
          )}

          {connectStatus === "error" && (
            <div>
              <p className="account-error">Failed to generate token. Please try again.</p>
              <button
                className="account-btn account-btn--primary"
                onClick={() => { setConnectStatus("idle"); }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .account-loading {
          display: flex; align-items: center; justify-content: center;
          min-height: 100vh; background: #0a0a0f;
        }
        .account-spinner {
          width: 32px; height: 32px; border-radius: 50%;
          border: 3px solid #2a2a3a; border-top-color: #7c3aed;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .account-page {
          min-height: 100vh; background: #0a0a0f; padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .account-container {
          max-width: 560px; margin: 0 auto; padding-top: 40px;
        }
        .account-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 32px;
        }
        .account-logo {
          font-size: 20px; font-weight: 800; letter-spacing: -0.5px;
          background: linear-gradient(135deg, #a78bfa, #7c3aed);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .account-signout {
          font-size: 13px; color: #666; background: none; border: none;
          cursor: pointer; padding: 4px 8px; border-radius: 6px;
        }
        .account-signout:hover { color: #aaa; background: #1e1e2e; }
        .account-card {
          background: #13131a; border: 1px solid #2a2a3a; border-radius: 12px;
          padding: 20px 24px; display: flex; align-items: center; gap: 16px;
          margin-bottom: 24px;
        }
        .account-avatar {
          width: 48px; height: 48px; border-radius: 50%; background: #7c3aed;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 700; color: #fff; flex-shrink: 0;
        }
        .account-name { font-size: 16px; font-weight: 600; color: #f0f0f8; margin: 0 0 2px; }
        .account-email { font-size: 14px; color: #888; margin: 0; }
        .account-section {
          background: #13131a; border: 1px solid #2a2a3a; border-radius: 12px;
          padding: 24px;
        }
        .account-section__title {
          font-size: 16px; font-weight: 700; color: #f0f0f8; margin: 0 0 8px;
        }
        .account-section__desc {
          font-size: 14px; color: #888; margin: 0 0 20px; line-height: 1.5;
        }
        .account-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 18px; border-radius: 8px; font-size: 14px;
          font-weight: 600; cursor: pointer; border: none; transition: background 0.15s;
        }
        .account-btn:disabled { opacity: 0.5; cursor: default; }
        .account-btn--primary { background: #7c3aed; color: #fff; }
        .account-btn--primary:hover:not(:disabled) { background: #6d28d9; }
        .account-btn--ghost {
          background: transparent; color: #a78bfa; border: 1px solid #333;
        }
        .account-btn--ghost:hover { background: #1e1e2e; }
        .account-btn--copy {
          background: #1e1e2e; color: #d0d0e8; border: 1px solid #333;
          font-size: 13px; padding: 6px 12px;
        }
        .account-btn--copy:hover { background: #28283a; }
        .account-token {
          display: flex; flex-direction: column; gap: 12px;
        }
        .account-token__code {
          display: block; background: #0a0a0f; border: 1px solid #2a2a3a;
          border-radius: 8px; padding: 12px 14px; font-size: 13px;
          font-family: monospace; color: #a78bfa; word-break: break-all;
          letter-spacing: 0.5px;
        }
        .account-token__hint {
          font-size: 13px; color: #666; margin: 0; line-height: 1.5;
        }
        .account-error { color: #f87171; font-size: 14px; margin: 0 0 12px; }
      `}</style>
    </div>
  );
}
