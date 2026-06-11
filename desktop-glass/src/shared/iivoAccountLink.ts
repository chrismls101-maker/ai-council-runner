/**
 * iivoAccountLink.ts — persisted IIVO account connection state.
 *
 * When a user pastes a connect token from iivo.ai/account into the Glass
 * Account tab, Glass verifies it against the server and stores the result
 * here so subsequent requests can include the session token.
 */

export interface IivoAccountLink {
  /** better-auth session token, sent as Bearer on Glass API calls. */
  sessionToken: string;
  userId: string;
  email: string;
  name: string | null;
  /** ISO timestamp when the link was established. */
  linkedAt: string;
}
