/**
 * Glass QA — monorepo-lite package root resolution for local checks.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function resolvePackageRootForPath(
  projectRoot: string,
  filePath: string,
  maxDepth = 8,
): string {
  const absProject = resolve(projectRoot);
  let dir = dirname(resolve(absProject, filePath.replace(/^\//, "")));

  for (let depth = 0; depth < maxDepth; depth++) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir || !dir.startsWith(absProject)) break;
    dir = parent;
  }

  return absProject;
}
