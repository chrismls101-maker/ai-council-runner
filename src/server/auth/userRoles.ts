/**
 * User roles — PostgreSQL column on better-auth `user` table.
 */

import type pg from "pg";

export type UserRole = "founder" | "admin" | "user";

const VALID_ROLES = new Set<UserRole>(["founder", "admin", "user"]);

export function normalizeUserRole(value: unknown): UserRole {
  if (typeof value === "string" && VALID_ROLES.has(value as UserRole)) {
    return value as UserRole;
  }
  return "user";
}

export async function ensureUserRoleSchema(pool: pg.Pool): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) return;
  await pool.query(`
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  `);
}

export async function seedFounderEmail(pool: pg.Pool): Promise<void> {
  const email = process.env.FOUNDER_EMAIL?.trim().toLowerCase();
  if (!email || !process.env.DATABASE_URL?.trim()) return;

  await pool.query(
    `UPDATE "user" SET role = 'founder' WHERE LOWER(email) = $1`,
    [email],
  );
}

export async function getUserRoleById(pool: pg.Pool, userId: string): Promise<UserRole> {
  if (!process.env.DATABASE_URL?.trim()) return "user";
  const res = await pool.query(`SELECT role FROM "user" WHERE id = $1 LIMIT 1`, [userId]);
  return normalizeUserRole(res.rows[0]?.role);
}

export async function getUserRoleByEmail(pool: pg.Pool, email: string): Promise<UserRole> {
  if (!process.env.DATABASE_URL?.trim()) return "user";
  const res = await pool.query(
    `SELECT role FROM "user" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  return normalizeUserRole(res.rows[0]?.role);
}
