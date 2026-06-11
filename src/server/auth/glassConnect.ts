/**
 * glassConnect.ts — Short-lived token flow for connecting Glass to a user account.
 *
 * Flow:
 *   1. User is logged in on iivo.ai in browser
 *   2. Glass opens https://iivo.ai/connect in browser (or user navigates there)
 *   3. The /connect page calls POST /api/auth/glass-connect/issue (authenticated)
 *      → Returns a { connectToken, expiresAt } (valid 5 minutes)
 *   4. User copies the token (or it auto-fills) into Glass settings
 *   5. Glass calls GET /api/auth/glass-connect/verify/:token
 *      → Returns { sessionToken, userId, email, name } on success
 *   6. Glass stores the sessionToken and sends it on future API calls
 */

import crypto from "node:crypto";

// In-memory store for short-lived connect tokens.
// These are ephemeral — restart clears them, which is fine (5-min TTL anyway).
interface ConnectEntry {
  userId: string;
  email: string;
  name: string | null;
  sessionToken: string;
  expiresAt: number;
}

const connectTokens = new Map<string, ConnectEntry>();

// Sweep expired tokens every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of connectTokens) {
    if (v.expiresAt < now) connectTokens.delete(k);
  }
}, 60_000);

export function issueGlassConnectToken(entry: Omit<ConnectEntry, "expiresAt">): string {
  const token = crypto.randomBytes(32).toString("hex");
  connectTokens.set(token, {
    ...entry,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
  return token;
}

export function verifyGlassConnectToken(token: string): ConnectEntry | null {
  const entry = connectTokens.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    connectTokens.delete(token);
    return null;
  }
  // Single-use: delete after claim
  connectTokens.delete(token);
  return entry;
}
