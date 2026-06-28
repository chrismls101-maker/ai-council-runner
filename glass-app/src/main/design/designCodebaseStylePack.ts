import type {
  CodebaseStylePack,
  DesignToCodeContext,
  ImportedFileContext,
} from "../../shared/designToCode.ts";
import { readImportGraph } from "../importGraphReader.ts";
import { scanDesignTokens } from "./designTokenScanner.ts";

const MAX_EXCERPT = 2_000;
const MAX_SIBLING_SNIPPET = 800;

async function readTextIfExists(path: string, maxChars: number): Promise<string | null> {
  try {
    const { promises: fsp } = await import("node:fs");
    const stat = await fsp.stat(path);
    if (!stat.isFile()) return null;
    const raw = await fsp.readFile(path, "utf8");
    return raw.length > maxChars ? `${raw.slice(0, maxChars)}\n…(truncated)` : raw;
  } catch {
    return null;
  }
}

async function findProjectRoot(startDir: string): Promise<string | null> {
  const { promises: fsp } = await import("node:fs");
  const path = await import("node:path");
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    try {
      await fsp.access(path.join(dir, "package.json"));
      return dir;
    } catch {
      /* continue up */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function readSiblingComponents(dir: string): Promise<CodebaseStylePack["similarLocalComponents"]> {
  const { promises: fsp } = await import("node:fs");
  const path = await import("node:path");
  const exts = new Set([".tsx", ".jsx", ".vue", ".svelte", ".astro"]);
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const out: NonNullable<CodebaseStylePack["similarLocalComponents"]> = [];
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!exts.has(ext)) continue;
      const full = path.join(dir, ent.name);
      const snippet = await readTextIfExists(full, MAX_SIBLING_SNIPPET);
      out.push({ fileName: ent.name, snippet: snippet ?? undefined });
      if (out.length >= 4) break;
    }
    return out;
  } catch {
    return [];
  }
}

function inferStylingFromContent(content: string, tailwindSummary?: string): string {
  if (tailwindSummary) return "Tailwind CSS";
  if (/className=\{[`'"]/i.test(content) || /className="[^"]*\b(flex|grid|p-|m-|text-)/.test(content)) {
    return "Tailwind CSS (likely)";
  }
  if (/styled\.|css`/.test(content)) return "styled-components";
  if (/\.module\.(css|scss)/.test(content)) return "CSS modules";
  if (/<style/.test(content)) return "scoped CSS";
  return "unknown";
}

export async function buildCodebaseStylePack(input: {
  ctx: DesignToCodeContext;
  importedFiles: ImportedFileContext[];
  readFileGranted: boolean;
  stackFallback: string;
}): Promise<CodebaseStylePack> {
  const { ctx, importedFiles, readFileGranted, stackFallback } = input;

  if (!readFileGranted || !ctx.filePath) {
    return {
      confidence: "none",
      framework: stackFallback,
    };
  }

  const pathMod = await import("node:path");
  const dir = pathMod.dirname(ctx.filePath);
  const root = (await findProjectRoot(dir)) ?? dir;

  const siblings = await readSiblingComponents(dir);
  const pkgRaw = await readTextIfExists(pathMod.join(root, "package.json"), 1_500);
  let packageJsonSummary: string | undefined;
  let uiLibraries: string[] = [];
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string> };
      const deps = Object.keys(pkg.dependencies ?? {});
      uiLibraries = deps.filter((d) =>
        /react|vue|svelte|tailwind|radix|shadcn|mui|chakra|angular|solid|astro|remix|next/i.test(d),
      );
      packageJsonSummary = `deps: ${deps.slice(0, 12).join(", ")}${deps.length > 12 ? "…" : ""}`;
    } catch {
      packageJsonSummary = "package.json present (parse skipped)";
    }
  }

  const tailwindCandidates = [
    "tailwind.config.ts",
    "tailwind.config.js",
    "tailwind.config.mjs",
  ];
  let tailwindSummary: string | undefined;
  for (const name of tailwindCandidates) {
    const tw = await readTextIfExists(pathMod.join(root, name), 600);
    if (tw) {
      tailwindSummary = `${name} present`;
      break;
    }
  }

  const tsconfig = await readTextIfExists(pathMod.join(root, "tsconfig.json"), 800);
  let tsconfigPathsSummary: string | undefined;
  if (tsconfig) {
    const pathsMatch = tsconfig.match(/"paths"\s*:\s*\{[^}]+\}/);
    tsconfigPathsSummary = pathsMatch ? pathsMatch[0].slice(0, 200) : "tsconfig.json present";
  }

  const content = ctx.content ?? "";
  const stylingSystem = inferStylingFromContent(content, tailwindSummary);
  const designTokens = await scanDesignTokens(root);

  const namingPatterns: string[] = [];
  if (/export function [A-Z]/.test(content)) namingPatterns.push("PascalCase function components");
  if (/export const [A-Z]/.test(content)) namingPatterns.push("PascalCase const components");
  if (/interface \w+Props/.test(content)) namingPatterns.push("*Props interfaces");

  const importConventions: string[] = [];
  if (/from ["']@\//.test(content)) importConventions.push("@/ path alias imports");
  if (/from ["']\.\//.test(content)) importConventions.push("relative imports");

  return {
    confidence: content ? "full" : "degraded",
    framework: stackFallback,
    language: ctx.language ?? undefined,
    stylingSystem,
    componentPatterns: namingPatterns.length ? namingPatterns : ["functional components"],
    namingPatterns,
    importConventions,
    pathAliasConventions: tsconfigPathsSummary ? [tsconfigPathsSummary] : undefined,
    uiLibraries: uiLibraries.length ? uiLibraries : undefined,
    designTokens: designTokens.length ? designTokens : undefined,
    similarLocalComponents: siblings,
    openFileContext: ctx.fileName
      ? {
          fileName: ctx.fileName,
          language: ctx.language ?? "code",
          filePath: ctx.filePath,
          contentExcerpt: content.slice(0, MAX_EXCERPT) || undefined,
        }
      : undefined,
    importedFileSummaries: importedFiles.map((f) => ({
      fileName: f.fileName,
      language: f.language,
    })),
    packageJsonSummary,
    tailwindSummary,
    tsconfigPathsSummary,
  };
}

export async function loadImportedFilesForDesign(
  filePath: string,
  fileContent: string,
): Promise<ImportedFileContext[]> {
  try {
    const graph = await readImportGraph(filePath, fileContent);
    return graph.map((f) => ({
      fileName: f.fileName,
      language: f.language,
      filePath: f.filePath,
      content: f.content,
    }));
  } catch {
    return [];
  }
}
