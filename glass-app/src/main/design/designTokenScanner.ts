const TOKEN_BASENAMES = new Set([
  "tokens.ts",
  "tokens.js",
  "tokens.json",
  "tokens.mjs",
  "design-tokens.ts",
  "design-tokens.js",
  "design-tokens.json",
  "design-tokens.css",
  "design-tokens.scss",
  "theme.ts",
  "theme.js",
  "colors.ts",
  "colors.js",
  "variables.css",
  "variables.scss",
  "globals.css",
  "global.css",
]);

const TOKEN_DIR_NAMES = ["tokens", "design-tokens", "theme"];

const MAX_TOKEN_LINES = 24;
const MAX_FILE_READ = 4_000;

export function extractCssCustomProperties(content: string, limit = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of content.matchAll(/--([a-zA-Z][\w-]*)\s*:/g)) {
    const name = `--${match[1]}`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

export function extractJsonTokenKeys(content: string, limit = 16): string[] {
  try {
    const data = JSON.parse(content) as unknown;
    const keys: string[] = [];
    const walk = (obj: unknown, prefix = "", depth = 0): void => {
      if (keys.length >= limit || depth > 3) return;
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string" || typeof value === "number") {
          keys.push(path);
        } else if (value && typeof value === "object") {
          walk(value, path, depth + 1);
        }
        if (keys.length >= limit) break;
      }
    };
    walk(data);
    return keys;
  } catch {
    return [];
  }
}

export function extractTailwindThemeHints(content: string): string[] {
  const hints: string[] = [];
  if (/theme\s*:\s*\{/.test(content) || /theme\.extend/.test(content)) {
    hints.push("tailwind theme extension present");
  }
  const colorsBlock = content.match(/colors\s*:\s*\{([\s\S]{0,1200})\}/);
  if (colorsBlock) {
    const names = [
      ...colorsBlock[1].matchAll(/['"]?([\w-]+)['"]?\s*:/g),
    ]
      .map((m) => m[1])
      .filter((name) => name !== "extend" && name !== "DEFAULT")
      .slice(0, 12);
    if (names.length) hints.push(`tailwind colors: ${names.join(", ")}`);
  }
  const spacingBlock = content.match(/spacing\s*:\s*\{([\s\S]{0,600})\}/);
  if (spacingBlock) {
    const names = [...spacingBlock[1].matchAll(/['"]?([\w.-]+)['"]?\s*:/g)]
      .map((m) => m[1])
      .slice(0, 8);
    if (names.length) hints.push(`tailwind spacing: ${names.join(", ")}`);
  }
  return hints;
}

function summarizeTokenFile(fileName: string, content: string): string[] {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json") {
    const keys = extractJsonTokenKeys(content);
    return keys.length ? [`${fileName}: ${keys.join(", ")}`] : [`${fileName} present`];
  }
  if (ext === "css" || ext === "scss") {
    const vars = extractCssCustomProperties(content);
    return vars.length ? [`${fileName} vars: ${vars.join(", ")}`] : [`${fileName} present`];
  }
  if (fileName.startsWith("tailwind.config")) {
    return extractTailwindThemeHints(content).map((h) => `${fileName}: ${h}`);
  }
  const vars = extractCssCustomProperties(content);
  if (vars.length) return [`${fileName} vars: ${vars.join(", ")}`];
  if (/export\s+(const|type)\s+\w+/.test(content) || /colors\s*[:=]/.test(content)) {
    return [`${fileName} token module present`];
  }
  return [`${fileName} present`];
}

async function readTextIfExists(path: string): Promise<string | null> {
  try {
    const { promises: fsp } = await import("node:fs");
    const stat = await fsp.stat(path);
    if (!stat.isFile()) return null;
    const raw = await fsp.readFile(path, "utf8");
    return raw.length > MAX_FILE_READ ? raw.slice(0, MAX_FILE_READ) : raw;
  } catch {
    return null;
  }
}

async function collectTokenFilePaths(root: string): Promise<string[]> {
  const pathMod = await import("node:path");
  const { promises: fsp } = await import("node:fs");
  const paths = new Set<string>();

  const roots = [root, pathMod.join(root, "src")];
  for (const base of roots) {
    for (const name of TOKEN_BASENAMES) {
      paths.add(pathMod.join(base, name));
    }
    for (const dirName of TOKEN_DIR_NAMES) {
      paths.add(pathMod.join(base, dirName));
    }
  }

  for (const name of ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs"]) {
    paths.add(pathMod.join(root, name));
  }

  const out: string[] = [];
  for (const candidate of paths) {
    try {
      const stat = await fsp.stat(candidate);
      if (stat.isFile()) {
        out.push(candidate);
        continue;
      }
      if (!stat.isDirectory()) continue;
      const entries = await fsp.readdir(candidate, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        const lower = ent.name.toLowerCase();
        if (
          TOKEN_BASENAMES.has(ent.name)
          || lower.endsWith(".css")
          || lower.endsWith(".scss")
          || lower.endsWith(".json")
          || /^tokens?\.(ts|js|mjs)$/i.test(ent.name)
        ) {
          out.push(pathMod.join(candidate, ent.name));
        }
        if (out.length >= 12) break;
      }
    } catch {
      /* missing path */
    }
    if (out.length >= 12) break;
  }

  return out.slice(0, 12);
}

/** Scan project root for design token files and summarize discoverable token names. */
export async function scanDesignTokens(projectRoot: string): Promise<string[]> {
  const pathMod = await import("node:path");
  const files = await collectTokenFilePaths(projectRoot);
  const summaries: string[] = [];

  for (const filePath of files) {
    const content = await readTextIfExists(filePath);
    if (!content) continue;
    const fileName = pathMod.basename(filePath);
    summaries.push(...summarizeTokenFile(fileName, content));
    if (summaries.length >= MAX_TOKEN_LINES) break;
  }

  return summaries.slice(0, MAX_TOKEN_LINES);
}
