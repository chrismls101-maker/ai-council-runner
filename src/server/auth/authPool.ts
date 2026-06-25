import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getAuthPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    pool = new Pool({
      connectionString: url,
      ssl: url ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}
