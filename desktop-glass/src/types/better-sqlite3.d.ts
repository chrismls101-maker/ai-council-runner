/**
 * Minimal ambient type stub for better-sqlite3 (Task #47).
 *
 * The real package is a native addon installed via `npm install better-sqlite3
 * @types/better-sqlite3` and rebuilt for the Electron ABI at startup. This stub
 * satisfies `tsc --noEmit` in environments where node_modules / @types are absent
 * (CI sandbox, dev machines before `npm install`), mirroring src/types/node-pty.d.ts.
 *
 * It only declares the surface used by src/main/scrollbackStore.ts. Once the real
 * @types/better-sqlite3 is installed it supersedes this (identical module shape).
 */
declare module "better-sqlite3" {
  namespace Database {
    interface Statement {
      run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    }

    interface Database {
      prepare(source: string): Statement;
      exec(source: string): Database;
      pragma(source: string, options?: { simple?: boolean }): unknown;
      transaction<T extends (...args: never[]) => unknown>(fn: T): T;
      close(): Database;
    }
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Record<string, unknown>): Database.Database;
    (filename: string, options?: Record<string, unknown>): Database.Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}
