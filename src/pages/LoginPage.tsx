/**
 * LoginPage.tsx — Sign in / Sign up for IIVO
 *
 * Supports: magic-link email, GitHub OAuth, Google OAuth
 * After login, redirects to /account (or ?redirect= param).
 */

import { useEffect, useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

type AuthCapabilities = {
  magicLink: boolean;
  magicLinkEmail: boolean;
  github: boolean;
  google: boolean;
};

const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [magicLinkClient()],
});

type Mode = "login" | "signup";
type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [mode] = useState<Mode>("login"); // login and signup are the same (magic link)
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);

  const redirectTo = new URLSearchParams(window.location.search).get("redirect") ?? "/account";

  useEffect(() => {
    void fetch("/api/auth/capabilities")
      .then((res) => res.json())
      .then((data: AuthCapabilities) => setCapabilities(data))
      .catch(() => {
        setCapabilities({
          magicLink: false,
          magicLinkEmail: false,
          github: false,
          google: false,
        });
      });
  }, []);

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: redirectTo,
      });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleGitHub() {
    if (!capabilities?.github) {
      setErrorMsg("GitHub sign-in is not configured yet. Use email magic link instead.");
      return;
    }
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: redirectTo,
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "GitHub sign-in failed");
    }
  }

  async function handleGoogle() {
    if (!capabilities?.google) {
      setErrorMsg("Google sign-in is not configured yet. Use email magic link instead.");
      return;
    }
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: redirectTo,
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Google sign-in failed");
    }
  }

  const socialEnabled = Boolean(capabilities?.github || capabilities?.google);
  const magicReady = capabilities?.magicLink === true;
  const loadingCaps = capabilities === null;

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo__text">IIVO</span>
        </div>

        <h1 className="login-title">
          {mode === "signup" ? "Create your account" : "Sign in to IIVO"}
        </h1>
        <p className="login-subtitle">
          {mode === "signup"
            ? "Get started — no password required."
            : "Welcome back. Enter your email for a magic link."}
        </p>

        {status === "sent" ? (
          <div className="login-sent">
            <div className="login-sent__icon">✉️</div>
            <p className="login-sent__title">Check your email</p>
            <p className="login-sent__body">
              We sent a sign-in link to <strong>{email}</strong>. It expires in 10 minutes.
            </p>
            <button
              className="login-btn login-btn--ghost"
              onClick={() => { setStatus("idle"); setEmail(""); }}
            >
              Use a different email
            </button>
          </div>
        ) : loadingCaps ? (
          <p className="login-hint">Loading sign-in options…</p>
        ) : (
          <>
            {/* Magic link form */}
            {magicReady ? (
            <form className="login-form" onSubmit={(e) => { void handleMagicLink(e); }}>
              <label className="login-form__label" htmlFor="email">Email address</label>
              <input
                id="email"
                className="login-form__input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
              <button
                className="login-btn login-btn--primary"
                type="submit"
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send magic link"}
              </button>
            </form>
            ) : (
              <p className="login-error">
                Email sign-in is not available yet — auth database is not configured on the server.
              </p>
            )}

            {capabilities && magicReady && !capabilities.magicLinkEmail ? (
              <p className="login-hint">
                Magic link is enabled but outbound email is not configured yet (RESEND_API_KEY).
              </p>
            ) : null}

            {errorMsg && (
              <p className="login-error">{errorMsg}</p>
            )}

            {socialEnabled ? (
              <>
            {/* Divider */}
            <div className="login-divider">
              <span>or continue with</span>
            </div>

            {/* OAuth providers */}
            <div className="login-oauth">
              {capabilities?.github ? (
              <button
                className="login-btn login-btn--oauth"
                type="button"
                onClick={() => { void handleGitHub(); }}
              >
                <GitHubIcon />
                GitHub
              </button>
              ) : null}
              {capabilities?.google ? (
              <button
                className="login-btn login-btn--oauth"
                type="button"
                onClick={() => { void handleGoogle(); }}
              >
                <GoogleIcon />
                Google
              </button>
              ) : null}
            </div>
              </>
            ) : null}
          </>
        )}

        <p className="login-legal">
          By continuing, you agree to our{" "}
          <a href="/terms">Terms of Service</a> and{" "}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0a0f;
          padding: 24px;
        }
        .login-card {
          background: #13131a;
          border: 1px solid #2a2a3a;
          border-radius: 16px;
          padding: 40px 36px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 24px 48px rgba(0,0,0,0.4);
        }
        .login-logo {
          margin-bottom: 28px;
        }
        .login-logo__text {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #a78bfa, #7c3aed);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .login-title {
          font-size: 22px;
          font-weight: 700;
          color: #f0f0f8;
          margin: 0 0 8px;
        }
        .login-subtitle {
          font-size: 14px;
          color: #888;
          margin: 0 0 28px;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .login-form__label {
          font-size: 13px;
          color: #aaa;
          font-weight: 500;
        }
        .login-form__input {
          background: #1e1e2e;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 11px 14px;
          font-size: 15px;
          color: #f0f0f8;
          outline: none;
          transition: border-color 0.15s;
          width: 100%;
          box-sizing: border-box;
        }
        .login-form__input:focus {
          border-color: #7c3aed;
        }
        .login-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 18px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: background 0.15s, opacity 0.15s;
          width: 100%;
        }
        .login-btn:disabled { opacity: 0.5; cursor: default; }
        .login-btn--primary {
          background: #7c3aed;
          color: #fff;
        }
        .login-btn--primary:hover:not(:disabled) { background: #6d28d9; }
        .login-btn--ghost {
          background: transparent;
          color: #a78bfa;
          border: 1px solid #333;
        }
        .login-btn--ghost:hover { background: #1e1e2e; }
        .login-btn--oauth {
          background: #1e1e2e;
          color: #d0d0e8;
          border: 1px solid #333;
          flex: 1;
        }
        .login-btn--oauth:hover { background: #28283a; }
        .login-oauth {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }
        .login-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 18px 0;
          color: #555;
          font-size: 13px;
        }
        .login-divider::before, .login-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #2a2a3a;
        }
        .login-error {
          color: #f87171;
          font-size: 13px;
          margin: -8px 0 8px;
        }
        .login-hint {
          color: #888;
          font-size: 12px;
          margin: 0 0 12px;
          line-height: 1.4;
        }
        .login-legal {
          font-size: 12px;
          color: #555;
          margin: 16px 0 0;
          line-height: 1.5;
        }
        .login-legal a { color: #7c3aed; text-decoration: none; }
        .login-legal a:hover { text-decoration: underline; }
        .login-sent {
          text-align: center;
          padding: 8px 0 16px;
        }
        .login-sent__icon { font-size: 40px; margin-bottom: 12px; }
        .login-sent__title {
          font-size: 18px;
          font-weight: 700;
          color: #f0f0f8;
          margin: 0 0 8px;
        }
        .login-sent__body {
          font-size: 14px;
          color: #888;
          margin: 0 0 20px;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
