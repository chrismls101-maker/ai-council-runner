/**
 * Save Glass overlay responses to the IIVO Memory Vault (POST /api/memory).
 */

import { iivoApiAuthHeaders } from "./iivoApiAuth.ts";
import { isIivoServerUnreachableError } from "./iivoServerDegraded.ts";
import { reportIivoServerDegraded } from "./iivoServerDegradedHooks.ts";

export interface GlassMemorySaveInput {
  apiUrl: string;
  content: string;
  prompt?: string;
  runId?: string;
}

export interface GlassMemorySavePayload {
  type: "evidence";
  title: string;
  content: string;
  sourceType: "glass";
  relatedRunId?: string;
}

const TITLE_MAX = 80;

export function buildGlassMemoryTitle(prompt: string | undefined, content: string): string {
  const fromPrompt = prompt?.trim();
  if (fromPrompt) {
    return fromPrompt.length > TITLE_MAX ? `${fromPrompt.slice(0, TITLE_MAX - 1)}…` : fromPrompt;
  }
  const firstLine = content.trim().split(/\n/)[0]?.trim() ?? "";
  if (firstLine) {
    return firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1)}…` : firstLine;
  }
  return "Glass response";
}

export function buildGlassMemoryPayload(input: {
  content: string;
  prompt?: string;
  runId?: string;
}): GlassMemorySavePayload {
  const content = input.content.trim();
  return {
    type: "evidence",
    title: buildGlassMemoryTitle(input.prompt, content),
    content,
    sourceType: "glass",
    relatedRunId: input.runId?.trim() || undefined,
  };
}

export async function saveResponseToMemoryVault(input: GlassMemorySaveInput): Promise<void> {
  const content = input.content.trim();
  if (!content) {
    throw new Error("Nothing to save");
  }

  const payload = buildGlassMemoryPayload({
    content,
    prompt: input.prompt,
    runId: input.runId,
  });

  const url = `${input.apiUrl.replace(/\/+$/, "")}/api/memory`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        ...iivoApiAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const message = "Memory save failed — IIVO server unavailable.";
    if (isIivoServerUnreachableError(err)) {
      reportIivoServerDegraded("memory", message);
    }
    throw new Error(message);
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      // ignore body read errors
    }
    const message = `Memory save failed (${res.status})${detail ? `: ${detail}` : ""}`;
    if (res.status >= 500 || res.status === 503) {
      reportIivoServerDegraded("memory", message);
    }
    throw new Error(message);
  }
}
