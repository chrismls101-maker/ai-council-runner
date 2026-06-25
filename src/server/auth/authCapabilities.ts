/**
 * Public auth capability flags — no secrets exposed.
 * Used by the login page to hide providers that are not configured on the server.
 */

import { isAuthDatabaseReady, getAuthInitError } from "./auth.js";
import { hasAuthDatabase } from "./authPool.js";

export type AuthCapabilities = {
  ok: true;
  /** True after better-auth migrations succeed on startup. */
  databaseReady: boolean;
  /** Sanitized startup error when databaseReady is false. */
  databaseError?: string;
  magicLink: boolean;
  /** True when Resend is configured so magic-link emails are actually sent. */
  magicLinkEmail: boolean;
  github: boolean;
  google: boolean;
};

export function getAuthCapabilities(): AuthCapabilities {
  const hasDb = hasAuthDatabase();
  const hasAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET?.trim());
  const databaseReady = hasDb && isAuthDatabaseReady();
  const databaseError = databaseReady ? undefined : getAuthInitError() ?? undefined;

  return {
    ok: true,
    databaseReady,
    databaseError,
    magicLink: databaseReady && hasAuthSecret,
    magicLinkEmail: Boolean(process.env.RESEND_API_KEY?.trim()),
    github: databaseReady && Boolean(process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()),
    google: databaseReady && Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()),
  };
}
