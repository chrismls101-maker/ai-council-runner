/**
 * Vision Memory Guard — API-level check via existing server unit test (no live OpenAI).
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export async function runVisionMemoryGuardUnitTest(): Promise<void> {
  await execFileAsync("npx", ["tsc", "-p", "tsconfig.server.json"], {
    cwd: PROJECT_ROOT,
    timeout: 120_000,
  });
  await execFileAsync(
    "node",
    ["--experimental-strip-types", "tests/server/visionMemoryGuard.test.ts"],
    {
      cwd: PROJECT_ROOT,
      timeout: 60_000,
    },
  );
}
