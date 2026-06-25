/**
 * LoginPage.tsx — Glass-style sign in for IIVO
 *
 * Magic link email, GitHub OAuth, Google OAuth.
 * Redirects to /account (or ?redirect=) after auth.
 */

import { useEffect, useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";
import "./LoginPage.css";

type AuthCapabilities = {
  databaseReady?: boolean;
  databaseError?: string;
  magicLink: boolean;
  magicLinkEmail: boolean;
  github: boolean;
  google: boolean;
};

type OAuthProvider = "github" | "google";
type AuthMode = "signin" | "signup";
type Status = "idle" | "sending" | "sent" | "error";

const REMEMBER_EMAIL_KEY = "iivo-login-email";
const REMEMBER_ME_KEY = "iivo-login-remember";

const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [magicLinkClient()],
  fetchOptions: {
    credentials: "include",
  },
});

function socialRedirectUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.url === "string" && record.url) return record.url;
  if (typeof record.redirect === "string" && record.redirect) return record.redirect;
  return null;
}

function initialMode(): AuthMode {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "signup" ? "signup" : "signin";
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotHint, setShowForgotHint] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);

  const redirectTo = new URLSearchParams(window.location.search).get("redirect") ?? "/account";

  useEffect(() => {
    const savedRemember = localStorage.getItem(REMEMBER_ME_KEY) === "true";
    const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY)?.trim() ?? "";
    if (savedRemember && savedEmail) {
      setRememberMe(true);
      setEmail(savedEmail);
    }
  }, []);

  useEffect(() => {
    void fetch("/api/auth/capabilities", { credentials: "include" })
      .then((res) => res.json())
      .then((data: AuthCapabilities) => setCapabilities(data))
      .catch(() => {
        setCapabilities({
          magicLink: false,
          magicLinkEmail: false,
          github: false,
          google: false,
          databaseReady: false,
        });
      });
  }, []);

  function persistRememberMe(nextEmail: string, remember: boolean): void {
    if (remember && nextEmail.trim()) {
      localStorage.setItem(REMEMBER_ME_KEY, "true");
      localStorage.setItem(REMEMBER_EMAIL_KEY, nextEmail.trim());
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMsg("");
    setShowForgotHint(false);
    try {
      const { error } = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: redirectTo,
      });
      if (error) {
        setStatus("error");
        setErrorMsg(error.message ?? "Could not send magic link");
        return;
      }
      persistRememberMe(email, rememberMe);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleSocial(provider: OAuthProvider) {
    if (provider === "github" && !capabilities?.github) {
      setErrorMsg("GitHub sign-in is not configured yet.");
      return;
    }
    if (provider === "google" && !capabilities?.google) {
      setErrorMsg("Google sign-in is not configured yet.");
      return;
    }

    setOauthLoading(provider);
    setErrorMsg("");
    setStatus("idle");
    setShowForgotHint(false);

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: redirectTo,
        disableRedirect: true,
      });

      if (result.error) {
        setStatus("error");
        setErrorMsg(result.error.message ?? `${provider} sign-in failed`);
        return;
      }

      const url = socialRedirectUrl(result.data);
      if (url) {
        window.location.assign(url);
        return;
      }

      setStatus("error");
      setErrorMsg("Sign-in did not return a redirect URL. Check server auth configuration.");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : `${provider} sign-in failed`);
    } finally {
      setOauthLoading(null);
    }
  }

  function switchMode(next: AuthMode): void {
    setMode(next);
    setShowForgotHint(false);
    setErrorMsg("");
    setStatus("idle");
  }

  const socialEnabled = Boolean(capabilities?.github || capabilities?.google);
  const magicReady = capabilities?.magicLink === true;
  const loadingCaps = capabilities === null;
  const busy = status === "sending" || oauthLoading !== null;
  const dbNotReady = capabilities !== null && capabilities.databaseReady === false;
  const isSignup = mode === "signup";

  return (
    <div className="glass-login">
      <div className="glass-login__mesh" aria-hidden="true" />
      <div className="glass-login__frame" aria-hidden="true">
        <span className="glass-login__corner glass-login__corner--tl" />
        <span className="glass-login__corner glass-login__corner--tr" />
        <span className="glass-login__corner glass-login__corner--bl" />
        <span className="glass-login__corner glass-login__corner--br" />
      </div>

      <div className="glass-login__layout">
        <a href="/" className="glass-login__back glass-login__back--outside">
          ← Back
        </a>

        <div className="glass-login__panel">
          <div className="glass-login__brand">
            <span className="glass-login__ring" aria-hidden="true">G</span>
            <span className="glass-login__wordmark">IIVO Glass</span>
          </div>

          <div className="glass-login__mode-tabs" role="tablist" aria-label="Sign in or sign up">
            <button
              type="button"
              role="tab"
              aria-selected={!isSignup}
              className={`glass-login__mode-tab ${!isSignup ? "glass-login__mode-tab--active" : ""}`}
              onClick={() => switchMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignup}
              className={`glass-login__mode-tab ${isSignup ? "glass-login__mode-tab--active" : ""}`}
              onClick={() => switchMode("signup")}
            >
              Sign up
            </button>
          </div>

          <h1 className="glass-login__title">{isSignup ? "Create your account" : "Welcome back"}</h1>
          <p className="glass-login__subtitle">
            {isSignup
              ? "Use your email or GitHub to create an IIVO account and connect Glass."
              : "Access your account, connect Glass, and manage your builder workspace."}
          </p>

          {status === "sent" ? (
            <div className="glass-login__sent">
              <div className="glass-login__sent-icon" aria-hidden="true">✉</div>
              <p className="glass-login__sent-title">Check your email</p>
              <p className="glass-login__sent-body">
                We sent a {isSignup ? "sign-up" : "sign-in"} link to <strong>{email}</strong>.
                It expires in 10 minutes.
              </p>
              <button
                type="button"
                className="glass-login__btn glass-login__btn--ghost"
                onClick={() => {
                  setStatus("idle");
                }}
              >
                Use a different email
              </button>
            </div>
          ) : loadingCaps ? (
            <p className="glass-login__hint">Loading sign-in options…</p>
          ) : dbNotReady ? (
            <p className="glass-login__error">
              Sign-in database is not ready yet.
              {capabilities?.databaseError ? ` (${capabilities.databaseError})` : " Refresh in a moment or check Railway Postgres + DATABASE_URL."}
            </p>
          ) : (
            <>
              {showForgotHint ? (
                <p className="glass-login__forgot-hint">
                  IIVO uses passwordless sign-in. Enter your email above and we&apos;ll send a magic
                  link — same flow as signing in.
                </p>
              ) : null}

              {magicReady ? (
                <form className="glass-login__form" onSubmit={(e) => { void handleMagicLink(e); }}>
                  <label className="glass-login__label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    className="glass-login__input"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    disabled={busy}
                  />
                  <div className="glass-login__row">
                    <label className="glass-login__remember">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setRememberMe(checked);
                          if (!checked) persistRememberMe(email, false);
                        }}
                        disabled={busy}
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      className="glass-login__forgot"
                      onClick={() => {
                        setShowForgotHint(true);
                        document.getElementById("email")?.focus();
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <button
                    className="glass-login__btn glass-login__btn--primary"
                    type="submit"
                    disabled={busy}
                  >
                    {status === "sending"
                      ? "Sending…"
                      : isSignup
                        ? "Create account with email"
                        : "Send magic link"}
                  </button>
                </form>
              ) : (
                <p className="glass-login__error">
                  Email sign-in is not available — auth database is not configured on the server.
                </p>
              )}

              {capabilities && magicReady && !capabilities.magicLinkEmail ? (
                <p className="glass-login__hint">
                  Magic link is enabled but outbound email is not configured (RESEND_API_KEY).
                </p>
              ) : null}

              {errorMsg ? <p className="glass-login__error">{errorMsg}</p> : null}

              {socialEnabled ? (
                <>
                  <div className="glass-login__divider">
                    <span>or</span>
                  </div>
                  <div className="glass-login__oauth-row">
                    {capabilities?.github ? (
                      <button
                        className="glass-login__btn glass-login__btn--oauth"
                        type="button"
                        disabled={busy}
                        onClick={() => { void handleSocial("github"); }}
                      >
                        <GitHubIcon />
                        {oauthLoading === "github" ? "Redirecting…" : isSignup ? "Sign up with GitHub" : "GitHub"}
                      </button>
                    ) : null}
                    {capabilities?.google ? (
                      <button
                        className="glass-login__btn glass-login__btn--oauth"
                        type="button"
                        disabled={busy}
                        onClick={() => { void handleSocial("google"); }}
                      >
                        <GoogleIcon />
                        {oauthLoading === "google" ? "Redirecting…" : isSignup ? "Sign up with Google" : "Google"}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}

              <p className="glass-login__switch-mode">
                {isSignup ? (
                  <>
                    Already have an account?{" "}
                    <button type="button" onClick={() => switchMode("signin")}>Sign in</button>
                  </>
                ) : (
                  <>
                    New to IIVO?{" "}
                    <button type="button" onClick={() => switchMode("signup")}>Create an account</button>
                  </>
                )}
              </p>
            </>
          )}

          <p className="glass-login__legal">
            By continuing, you agree to our{" "}
            <a href="/terms">Terms of Service</a> and{" "}
            <a href="/privacy">Privacy Policy</a>.
          </p>

          <span className="glass-login__led" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
