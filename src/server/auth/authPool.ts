import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let activeDatabaseUrl: string | null = null;

function isRailwayInternalUrl(url: string): boolean {
  return url.includes("railway.internal");
}

function createPool(url: string): pg.Pool {
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  const useSsl = !isLocal;
  return new Pool({
    connectionString: url,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    connectionTimeoutMillis: 15_000,
  });
}

/** Ordered candidates — public URL used when internal Railway DNS is unreachable. */
export function listDatabaseUrlCandidates(): string[] {
  const internal = process.env.DATABASE_URL?.trim();
  const publicUrl = process.env.DATABASE_PUBLIC_URL?.trim();
  const postgresUrl = process.env.POSTGRES_URL?.trim();

  const ordered: string[] = [];
  if (internal) ordered.push(internal);
  if (publicUrl && publicUrl !== internal) ordered.push(publicUrl);
  if (postgresUrl && !ordered.includes(postgresUrl)) ordered.push(postgresUrl);
  return ordered;
}

export function resolveDatabaseUrl(): string | undefined {
  return listDatabaseUrlCandidates()[0];
}

export function hasAuthDatabase(): boolean {
  return listDatabaseUrlCandidates().length > 0;
}

/** Reset pool so the next getAuthPool() can try a different URL. */
export function resetAuthPool(): void {
  void pool?.end().catch(() => undefined);
  pool = null;
  activeDatabaseUrl = null;
}

export function getAuthPool(): pg.Pool {
  const url = activeDatabaseUrl ?? resolveDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = createPool(url);
    activeDatabaseUrl = url;
  }
  return pool;
}

/** Connect using the first working Postgres URL (handles Railway internal DNS failures). */
export async function connectAuthPool(): Promise<pg.Pool> {
  const candidates = listDatabaseUrlCandidates();
  if (candidates.length === 0) {
    throw new Error("DATABASE_URL is not configured");
  }

  let lastError: unknown;
  for (const url of candidates) {
    resetAuthPool();
    const candidatePool = createPool(url);
    try {
      await candidatePool.query("SELECT 1");
      pool = candidatePool;
      activeDatabaseUrl = url;
      if (isRailwayInternalUrl(url)) {
        console.log("[auth] Connected via DATABASE_URL (Railway private network)");
      } else if (url === process.env.DATABASE_PUBLIC_URL?.trim()) {
        console.log("[auth] Connected via DATABASE_PUBLIC_URL");
      } else {
        console.log("[auth] Connected to Postgres");
      }
      return candidatePool;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const hasFallback = candidates.indexOf(url) < candidates.length - 1;
      if (hasFallback) {
        console.warn(`[auth] Postgres URL failed (${message}) — trying next candidate`);
      }
      void candidatePool.end().catch(() => undefined);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
