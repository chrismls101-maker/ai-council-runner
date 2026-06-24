declare module "sqlite-vec" {
  interface SqliteVecDb {
    loadExtension(file: string, entrypoint?: string): void;
  }
  export function getLoadablePath(): string;
  export function load(db: SqliteVecDb): void;
}
