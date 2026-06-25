/**
 * AccountPage.tsx — Post-login account hub (Glass design)
 *
 * Regular users: welcome, Glass connection, usage snapshot, account support.
 * Founders: same base view plus a Founder tab with the existing dashboard.
 */

import { useState, useEffect } from "react";
import { createAuthClient } from "better-auth/client";
import AccountWelcomeCard from "../components/account/AccountWelcomeCard";
import GlassConnectionCard from "../components/account/GlassConnectionCard";
import UsageSnapshotCard from "../components/account/UsageSnapshotCard";
import AccountSupportCard from "../components/account/AccountSupportCard";
import FounderDashboard from "../components/account/FounderDashboard";
import "./AccountPage.css";

const authClient = createAuthClient({
  baseURL: window.location.origin,
});

type ConnectStatus = "idle" | "generating" | "ready" | "error";
type AccountTab = "account" | "founder";
type UserRole = "founder" | "admin" | "user";

function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac/i.test(navigator.userAgent) || /Mac/i.test(navigator.platform ?? "");
}

export default function AccountPage() {
  const [user, setUser] = useState<{ name?: string | null; email: string; image?: string | null } | null>(null);
  const [role, setRole] = useState<UserRole>("user");
  const [tab, setTab] = useState<AccountTab>("account");
  const [loading, setLoading] = useState(true);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle");
  const [connectToken, setConnectToken] = useState("");
  const [tokenExpiresAt, setTokenExpiresAt] = useState<Date | undefined>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await authClient.getSession();
      setUser(res?.data?.user ?? null);
      if (!res?.data?.user) {
        setLoading(false);
        window.location.href = "/login?redirect=/account";
        return;
      }
      try {
        const profileRes = await fetch("/api/account/profile", { credentials: "include" });
        if (profileRes.ok) {
          const profile = (await profileRes.json()) as { user?: { role?: UserRole } };
          if (profile.user?.role) setRole(profile.user.role);
        }
      } catch {
        /* profile optional */
      }
      setLoading(false);
    })();
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
      const data = (await res.json()) as { connectToken: string; expiresIn?: number };
      setConnectToken(data.connectToken);
      const ttlMs = (data.expiresIn ?? 300) * 1000;
      setTokenExpiresAt(new Date(Date.now() + ttlMs));
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

  function handleResetToken() {
    setConnectStatus("idle");
    setConnectToken("");
    setTokenExpiresAt(undefined);
    setCopied(false);
  }

  if (loading) {
    return (
      <div className="glass-account-loading">
        <div className="glass-account-spinner" aria-label="Loading account" />
      </div>
    );
  }

  if (!user) return null;

  const avatarLetter = (user.name?.trim() || user.email).charAt(0).toUpperCase();
  const isFounder = role === "founder";

  // Glass link status is tracked client-side in Glass today; web profile has no link fields yet.
  const glassLinked = false;

  return (
    <div className="glass-account">
      <div className="glass-account__mesh" aria-hidden="true" />
      <div className="glass-account__frame" aria-hidden="true">
        <span className="glass-account__corner glass-account__corner--tl" />
        <span className="glass-account__corner glass-account__corner--tr" />
        <span className="glass-account__corner glass-account__corner--bl" />
        <span className="glass-account__corner glass-account__corner--br" />
      </div>

      <div className="glass-account__inner">
        <header className="glass-account__topbar">
          <a href="/" className="glass-account__brand">
            <span className="glass-account__ring" aria-hidden="true">G</span>
            <span className="glass-account__wordmark">IIVO Glass</span>
          </a>
          <button type="button" className="glass-account__signout" onClick={() => { void handleSignOut(); }}>
            Sign out
          </button>
        </header>

        <h1 className="glass-account__heading">Account</h1>

        {isFounder ? (
          <div className="glass-account-tabs" role="tablist" aria-label="Account sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "account"}
              className={`glass-account-tab ${tab === "account" ? "glass-account-tab--active" : ""}`}
              onClick={() => setTab("account")}
            >
              Account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "founder"}
              className={`glass-account-tab ${tab === "founder" ? "glass-account-tab--active" : ""}`}
              onClick={() => setTab("founder")}
            >
              Founder
            </button>
          </div>
        ) : null}

        {tab === "founder" && isFounder ? (
          <FounderDashboard />
        ) : (
          <div className="glass-account-stack">
            <AccountWelcomeCard
              name={user.name}
              email={user.email}
              avatarLetter={avatarLetter}
              glassStatus={{ isLinked: glassLinked }}
              showMacHint={isMacOS()}
            />
            <GlassConnectionCard
              isLinked={glassLinked}
              connectStatus={connectStatus}
              connectToken={connectToken}
              expiresAt={tokenExpiresAt}
              copied={copied}
              onGenerateToken={() => { void handleGenerateToken(); }}
              onCopy={() => { void handleCopy(); }}
              onResetToken={handleResetToken}
            />
            <UsageSnapshotCard />
            <AccountSupportCard />
          </div>
        )}
      </div>
    </div>
  );
}
