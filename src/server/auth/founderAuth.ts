/**
 * Founder auth — web cookie sessions + Glass bearer session tokens.
 */

import type { Request } from "express";
import { auth } from "./auth.js";
import { getAuthPool } from "./authPool.js";
import { getUserRoleById, type UserRole } from "./userRoles.js";

export type FounderUser = {
  userId: string;
  email: string;
  name: string | null;
  role: UserRole;
};

export class FounderAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function expressHeadersToFetch(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

export async function getUserFromSessionToken(token: string): Promise<FounderUser | null> {
  const trimmed = token.trim();
  if (!trimmed || !process.env.DATABASE_URL?.trim()) return null;

  const pool = getAuthPool();
  const res = await pool.query(
    `
      SELECT u.id, u.email, u.name, u.role, s."expiresAt"
      FROM "session" s
      JOIN "user" u ON u.id = s."userId"
      WHERE s.token = $1
      LIMIT 1
    `,
    [trimmed],
  );
  const row = res.rows[0];
  if (!row) return null;

  const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return null;
  }

  return {
    userId: String(row.id),
    email: String(row.email),
    name: row.name == null ? null : String(row.name),
    role: row.role === "founder" || row.role === "admin" ? row.role : "user",
  };
}

export async function getCurrentUserWithRole(req: Request): Promise<FounderUser> {
  const session = await auth.api.getSession({ headers: expressHeadersToFetch(req) });
  if (!session?.user) {
    throw new FounderAuthError(401, "Not authenticated.");
  }

  const role = await getUserRoleById(getAuthPool(), session.user.id);
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    role,
  };
}

export async function resolveAuthenticatedUser(req: Request): Promise<FounderUser> {
  try {
    return await getCurrentUserWithRole(req);
  } catch (err) {
    if (!(err instanceof FounderAuthError) || err.status !== 401) throw err;
  }

  const authHeader = req.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const user = await getUserFromSessionToken(authHeader.slice(7));
    if (user) return user;
  }

  throw new FounderAuthError(401, "Not authenticated.");
}

export async function requireFounder(req: Request): Promise<FounderUser> {
  const user = await resolveAuthenticatedUser(req);
  if (user.role !== "founder") {
    throw new FounderAuthError(403, "Founder access required.");
  }
  return user;
}
