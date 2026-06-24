/**
 * Minimal ambient type stub for node-pty.
 * The real package is a native addon built at install time; these types
 * satisfy tsc --noEmit in environments where node_modules is absent
 * (CI sandbox, dev machines before `npm install`).
 */
declare module "node-pty" {
  export interface IPtyForkOptions {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string | undefined>;
    encoding?: string;
  }

  export interface IPty {
    readonly pid: number;
    readonly cols: number;
    readonly rows: number;
    readonly process: string;
    onData(listener: (data: string) => void): void;
    onExit(listener: (e: { exitCode: number; signal?: number }) => void): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
  }

  export function spawn(
    file: string,
    args: string[],
    options: IPtyForkOptions,
  ): IPty;
}
