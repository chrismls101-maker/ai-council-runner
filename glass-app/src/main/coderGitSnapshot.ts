/**
 * Capture git snapshot for Glass Coder bootstrap (main process only).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expandAgentPath } from "./agentCoderTools.ts";
import {
  formatCoderGitBootstrap,
  parseGitPorcelain,
  type CoderGitBootstrapInput,
} from "../shared/coderGitContext.ts";

const execFileAsync = promisify(execFile);

async function gitInRepo(
  cwd: string,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: 8_000,
      maxBuffer: 512_000,
    });
    return stdout;
  } catch {
    return null;
  }
}

export async function captureCoderGitBootstrap(projectRoot: string): Promise<string | undefined> {
  const cwd = expandAgentPath(projectRoot);
  const inside = await gitInRepo(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside?.trim().startsWith("true")) return undefined;

  const branch = await gitInRepo(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const porcelain = await gitInRepo(cwd, ["status", "--porcelain"]);
  const diffStat = await gitInRepo(cwd, ["diff", "--stat", "HEAD"]);

  const porcelainLines = porcelain?.split("\n").filter((l) => l.trim()) ?? [];
  const input: CoderGitBootstrapInput = {
    branch: branch?.trim() || undefined,
    porcelainLines,
    diffStatLines: diffStat?.split("\n").filter((l) => l.trim()) ?? [],
  };

  // Touch parser for tests / future filtering
  void parseGitPorcelain(porcelain ?? "");

  return formatCoderGitBootstrap(input);
}
