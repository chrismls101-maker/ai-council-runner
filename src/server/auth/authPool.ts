import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getAuthPool(): pg.Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    const useSsl = !url.includes("localhost") && !url.includes("127.0.0.1");
    pool = new Pool({
      connectionString: url,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      connectionTimeoutMillis: 15_000,
    });
  }
  return pool;
}

export function hasAuthDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
