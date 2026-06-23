import * as monaco from "monaco-editor";
import type { GlassIdeTsConfigResponse, MonacoCompilerOptionsJson } from "../../shared/glassIdeTsConfig.ts";
import { DEFAULT_MONACO_COMPILER_OPTIONS, mergeMonacoCompilerOptions } from "../../shared/glassIdeTsConfig.ts";

let configuredProjectKey: string | null = null;
let resolvedProjectRoot: string | null = null;

export function getGlassIdeProjectRootForModels(): string | null {
  return resolvedProjectRoot;
}

function applyCompilerOptions(options: MonacoCompilerOptionsJson): void {
  const merged = mergeMonacoCompilerOptions(DEFAULT_MONACO_COMPILER_OPTIONS, options);
  const diagnostics = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  };

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
    merged as monaco.languages.typescript.CompilerOptions,
  );
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnostics);
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.typescriptDefaults.setMaximumWorkerIdleTime(-1);

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
    merged as monaco.languages.typescript.CompilerOptions,
  );
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnostics);
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.javascriptDefaults.setMaximumWorkerIdleTime(-1);
}

export async function configureGlassIdeTypeScript(
  projectRootLabel: string,
): Promise<GlassIdeTsConfigResponse> {
  const res = await window.glass.glassIdeReadTsConfig();
  const key = projectRootLabel.trim();
  if (!res.ok) {
    if (configuredProjectKey !== key) {
      applyCompilerOptions(DEFAULT_MONACO_COMPILER_OPTIONS);
      configuredProjectKey = key;
      resolvedProjectRoot = res.projectRoot ?? null;
    }
    return res;
  }

  if (configuredProjectKey === key && resolvedProjectRoot === res.projectRoot) {
    return res;
  }

  applyCompilerOptions(res.compilerOptions ?? DEFAULT_MONACO_COMPILER_OPTIONS);
  configuredProjectKey = key;
  resolvedProjectRoot = res.projectRoot ?? null;
  return res;
}
