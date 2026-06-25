/**
 * Public auth capability flags — no secrets exposed.
 * Used by the login page to hide providers that are not configured on the server.
 */

export type AuthCapabilities = {
  ok: true;
  magicLink: boolean;
  /** True when Resend is configured so magic-link emails are actually sent. */
  magicLinkEmail: boolean;
  github: boolean;
  google: boolean;
};

export function getAuthCapabilities(): AuthCapabilities {
  const hasDb = Boolean(process.env.DATABASE_URL?.trim());
  const hasAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET?.trim());

  return {
    ok: true,
    magicLink: hasDb && hasAuthSecret,
    magicLinkEmail: Boolean(process.env.RESEND_API_KEY?.trim()),
    github: Boolean(process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()),
    google: Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()),
  };
}
