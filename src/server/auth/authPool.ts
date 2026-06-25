import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getAuthPool(): pg.Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export function hasAuthDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
