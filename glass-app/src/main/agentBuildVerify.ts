/**
 * Glass Coder — post-apply typecheck / build verification (no feed UI).
 */

import { existsSync } from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runShellCommand } from "./glassActions.ts";

export interface BuildCheckResult {
  command: string;
  ok: boolean;
  summary: string;
}

/** Walk up from filePath to find a tsconfig or package.json build script. */
export async function resolveBuildCommand(
  filePath: string,
): Promise<{ cmd: string; cwd: string } | null> {
  const expandedPath = filePath.startsWith("~/")
    ? path.join(os.homedir(), filePath.slice(2))
    : filePath;
  let dir = path.dirname(path.resolve(expandedPath));
  const home = os.homedir();

  for (let depth = 0; depth < 12; depth++) {
    if (existsSync(path.join(dir, "tsconfig.json"))) {
      const pkgPath = path.join(dir, "package.json");
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(await fsp.readFile(pkgPath, "utf8")) as { scripts?: Record<string, string> };
          if (pkg.scripts?.["typecheck"] ?? pkg.scripts?.["type-check"]) {
            const scriptKey = pkg.scripts?.["typecheck"] !== undefined ? "typecheck" : "type-check";
            return { cmd: `npm run ${scriptKey}`, cwd: dir };
          }
          if (pkg.scripts?.["build"]) {
            return { cmd: "npm run build", cwd: dir };
          }
        } catch {
          /* parse error — fall through */
        }
      }
      return { cmd: "npx tsc --noEmit", cwd: dir };
    }

    const pkgPath = path.join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await fsp.readFile(pkgPath, "utf8")) as { scripts?: Record<string, string> };
        if (pkg.scripts?.["typecheck"] ?? pkg.scripts?.["type-check"]) {
          const scriptKey = pkg.scripts?.["typecheck"] !== undefined ? "typecheck" : "type-check";
          return { cmd: `npm run ${scriptKey}`, cwd: dir };
        }
        if (pkg.scripts?.["build"]) {
          return { cmd: "npm run build", cwd: dir };
        }
      } catch {
        /* continue */
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir || (home && !dir.startsWith(home))) break;
    dir = parent;
  }
  return null;
}

/** Run a silent build check and return a summary for the agent tool result. */
export async function verifyAppliedFile(filePath: string): Promise<BuildCheckResult | null> {
  const ext = path.extname(filePath).toLowerCase();
  if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) return null;

  const buildCmd = await resolveBuildCommand(filePath);
  if (!buildCmd) return null;

  return new Promise((resolve) => {
    let output = "";
    runShellCommand(
      `cd ${JSON.stringify(buildCmd.cwd)} && ${buildCmd.cmd} 2>&1`,
      (chunk) => { output += chunk; },
      (exitCode) => {
        const trimmed = output.trim();
        const tail = trimmed.split("\n").slice(-12).join("\n");
        const ok = exitCode === 0;
        resolve({
          command: buildCmd.cmd,
          ok,
          summary: ok
            ? "Build check passed."
            : `Build check failed (exit ${exitCode ?? "?"}):\n${tail.slice(-1500)}`,
        });
      },
    );
  });
}
