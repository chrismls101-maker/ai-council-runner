/**
 * iivoAccountLink.ts — persisted IIVO account connection state.
 *
 * When a user pastes a connect token from iivo.ai/account into the Glass
 * Account tab, Glass verifies it against the server and stores the result
 * here so subsequent requests can include the session token.
 */

export interface IivoAccountLink {
  /** better-auth session token, sent as Bearer on founder API calls. */
  sessionToken: string;
  userId: string;
  email: string;
  name: string | null;
  role: "founder" | "admin" | "user";
  /** Whether this link gets the full Coder build loop (set at connect time). */
  fullBuildLoop: boolean;
  /** ISO timestamp when the link was established. */
  linkedAt: string;
}
