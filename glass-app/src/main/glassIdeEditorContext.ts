/**
 * Glass IDE — in-memory editor context cache (main process).
 */

import { listGlassIdeProjectFiles } from "./glassIdeProject.ts";
import {
  emptyGlassIdeEditorContext,
  resolveGlassIdeFileQuery,
  type GlassIdeEditorContext,
} from "../shared/glassIdeEditorContext.ts";
import { enrichPromptWithEditorContext } from "../shared/glassIdeEditorContext.ts";

let cachedEditorContext: GlassIdeEditorContext = emptyGlassIdeEditorContext();

export function setGlassIdeEditorContext(ctx: GlassIdeEditorContext): void {
  cachedEditorContext = ctx;
}

export function getGlassIdeEditorContext(): GlassIdeEditorContext {
  return cachedEditorContext;
}

export function enrichAgentPromptForIde(prompt: string, glassIdeActive: boolean): string {
  if (!glassIdeActive) return prompt;
  return enrichPromptWithEditorContext(prompt, cachedEditorContext);
}

export async function resolveGlassIdeVoiceFileQuery(
  projectRoot: string,
  query: string,
): Promise<string | null> {
  const listed = await listGlassIdeProjectFiles(projectRoot);
  if (!listed.ok || !listed.entries?.length) return null;
  const paths = listed.entries.filter((e) => !e.isDirectory).map((e) => e.relativePath);
  return resolveGlassIdeFileQuery(query, paths);
}

export function clearGlassIdeEditorContext(): void {
  cachedEditorContext = emptyGlassIdeEditorContext();
}
