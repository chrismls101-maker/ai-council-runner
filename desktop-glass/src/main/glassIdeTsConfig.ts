/**
 * Glass IDE — read tsconfig / jsconfig for Monaco TypeScript worker.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import type ts from "typescript";
import { expandAgentPath } from "./agentCoderTools.ts";
import {
  DEFAULT_MONACO_COMPILER_OPTIONS,
  mergeMonacoCompilerOptions,
  TS_CONFIG_CANDIDATES,
  type GlassIdeTsConfigResponse,
  type MonacoCompilerOptionsJson,
} from "../shared/glassIdeTsConfig.ts";

const nodeRequire = createRequire(import.meta.url);

function loadTypeScript(): typeof import("typescript") {
  return nodeRequire("typescript") as typeof import("typescript");
}

function resolveProjectRoot(projectRoot: string): string {
  return path.resolve(expandAgentPath(projectRoot.trim()));
}

function findConfigPath(root: string): string | null {
  for (const name of TS_CONFIG_CANDIDATES) {
    const candidate = path.join(root, name);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

function toMonacoCompilerOptions(options: ts.CompilerOptions): MonacoCompilerOptionsJson {
  const out: MonacoCompilerOptionsJson = {
    allowJs: options.allowJs,
    checkJs: options.checkJs,
    strict: options.strict,
    noEmit: true,
    esModuleInterop: options.esModuleInterop,
    allowSyntheticDefaultImports: options.allowSyntheticDefaultImports,
    skipLibCheck: options.skipLibCheck,
    isolatedModules: options.isolatedModules,
    resolveJsonModule: options.resolveJsonModule,
  };
  if (options.target != null) out.target = options.target as number;
  if (options.module != null) out.module = options.module as number;
  if (options.moduleResolution != null) out.moduleResolution = options.moduleResolution as number;
  if (options.jsx != null) out.jsx = options.jsx as number;
  if (options.lib) out.lib = [...options.lib];
  if (options.baseUrl) out.baseUrl = options.baseUrl;
  if (options.paths) out.paths = { ...options.paths };
  if (options.types) out.types = [...options.types];
  return out;
}

export async function readGlassIdeTsConfig(
  projectRoot: string,
): Promise<GlassIdeTsConfigResponse> {
  const trimmed = projectRoot.trim();
  if (!trimmed) {
    return { ok: false, error: "Set a project folder first." };
  }

  const root = resolveProjectRoot(trimmed);
  try {
    const stat = fs.statSync(root);
    if (!stat.isDirectory()) {
      return { ok: false, error: "Project folder is not a directory." };
    }
  } catch {
    return { ok: false, error: "Project folder not found." };
  }

  const configPath = findConfigPath(root);
  if (!configPath) {
    return {
      ok: true,
      projectRoot: root,
      configPath: null,
      compilerOptions: mergeMonacoCompilerOptions(DEFAULT_MONACO_COMPILER_OPTIONS, undefined),
    };
  }

  const ts = loadTypeScript();
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    return {
      ok: false,
      projectRoot: root,
      error: ts.flattenDiagnosticMessageText(readResult.error.messageText, "\n"),
    };
  }

  const parsed = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    path.dirname(configPath),
  );

  const blockingErrors = parsed.errors.filter((diag) => diag.code !== 18003);
  if (blockingErrors.length > 0) {
    const first = blockingErrors[0];
    return {
      ok: false,
      projectRoot: root,
      error: ts.flattenDiagnosticMessageText(first.messageText, "\n"),
    };
  }

  const relConfig = path.relative(root, configPath);
  return {
    ok: true,
    projectRoot: root,
    configPath: relConfig || path.basename(configPath),
    compilerOptions: mergeMonacoCompilerOptions(
      DEFAULT_MONACO_COMPILER_OPTIONS,
      toMonacoCompilerOptions(parsed.options),
    ),
  };
}
