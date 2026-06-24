/** Glass IDE — TypeScript / JavaScript intelligence (Monaco worker + tsconfig). */

export interface GlassIdeTsConfigResponse {
  ok: boolean;
  /** Resolved absolute project root on disk. */
  projectRoot?: string;
  /** Relative path to config file from project root, if found. */
  configPath?: string | null;
  /** Monaco-compatible compiler options (JSON-serializable). */
  compilerOptions?: MonacoCompilerOptionsJson;
  error?: string;
}

/** Subset of Monaco / TS compiler options sent renderer → worker. */
export interface MonacoCompilerOptionsJson {
  allowJs?: boolean;
  checkJs?: boolean;
  strict?: boolean;
  noEmit?: boolean;
  esModuleInterop?: boolean;
  allowSyntheticDefaultImports?: boolean;
  skipLibCheck?: boolean;
  isolatedModules?: boolean;
  resolveJsonModule?: boolean;
  target?: number;
  module?: number;
  moduleResolution?: number;
  jsx?: number;
  lib?: string[];
  baseUrl?: string;
  paths?: Record<string, string[]>;
  types?: string[];
}

export const TS_CONFIG_CANDIDATES = [
  "tsconfig.json",
  "jsconfig.json",
  "tsconfig.app.json",
  "tsconfig.base.json",
] as const;

export const DEFAULT_MONACO_COMPILER_OPTIONS: MonacoCompilerOptionsJson = {
  allowJs: true,
  checkJs: false,
  strict: false,
  noEmit: true,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
  skipLibCheck: true,
  isolatedModules: true,
  resolveJsonModule: true,
  target: 99, // ESNext
  module: 99, // ESNext
  moduleResolution: 2, // NodeJs
  jsx: 2, // React
  lib: ["es2022", "dom", "dom.iterable"],
};

export function mergeMonacoCompilerOptions(
  base: MonacoCompilerOptionsJson,
  fromConfig: MonacoCompilerOptionsJson | undefined,
): MonacoCompilerOptionsJson {
  if (!fromConfig) return { ...base };
  return {
    ...base,
    ...fromConfig,
    lib: fromConfig.lib?.length ? fromConfig.lib : base.lib,
    paths: fromConfig.paths ?? base.paths,
    types: fromConfig.types ?? base.types,
    noEmit: true,
  };
}

/** Map loose tsconfig compilerOptions JSON (before TS resolve) for tests. */
export function mapRawTsConfigCompilerOptions(
  raw: Record<string, unknown> | undefined,
): MonacoCompilerOptionsJson {
  if (!raw) return {};
  const out: MonacoCompilerOptionsJson = {};
  const boolKeys = [
    "allowJs",
    "checkJs",
    "strict",
    "esModuleInterop",
    "allowSyntheticDefaultImports",
    "skipLibCheck",
    "isolatedModules",
    "resolveJsonModule",
  ] as const;
  for (const key of boolKeys) {
    if (typeof raw[key] === "boolean") out[key] = raw[key];
  }
  if (Array.isArray(raw.lib)) {
    out.lib = raw.lib.filter((v): v is string => typeof v === "string");
  }
  if (typeof raw.baseUrl === "string") out.baseUrl = raw.baseUrl;
  if (raw.paths && typeof raw.paths === "object") {
    out.paths = raw.paths as Record<string, string[]>;
  }
  if (Array.isArray(raw.types)) {
    out.types = raw.types.filter((v): v is string => typeof v === "string");
  }
  return out;
}

export function isTypeScriptLanguageId(language: string): boolean {
  return language === "typescript" || language === "javascript";
}

export function shouldUseTsxMode(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith(".tsx") || relativePath.toLowerCase().endsWith(".jsx");
}
