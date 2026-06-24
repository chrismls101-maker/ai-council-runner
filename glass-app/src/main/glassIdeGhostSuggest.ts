/**
 * Line-level ghost text for Glass IDE — Haiku completion for current line suffix only.
 */

import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";
import { readGlassIdeProjectFile } from "./glassIdeProject.ts";
import { parseGhostSuggestion } from "../shared/glassIdeGhostSuggest.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const CONTEXT_LINES = 12;

export interface GlassIdeGhostSuggestRequest {
  relativePath: string;
  line: number;
  linePrefix: string;
}

export interface GlassIdeGhostSuggestResponse {
  suggestion: string;
}

function resolveAnthropicKey(): string | null {
  const keys = listApiKeys();
  for (const meta of keys) {
    if (meta.service.toLowerCase().includes("anthropic")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ?? null;
}

export async function ghostSuggestLineCompletion(
  projectRoot: string,
  payload: GlassIdeGhostSuggestRequest,
): Promise<GlassIdeGhostSuggestResponse> {
  const rel = payload.relativePath?.trim().replace(/\\/g, "/") ?? "";
  const line = Number.isFinite(payload.line) ? Math.max(1, Math.floor(payload.line)) : 1;
  const linePrefix = typeof payload.linePrefix === "string" ? payload.linePrefix : "";

  if (!rel || linePrefix.trim().length < 2) {
    return { suggestion: "" };
  }

  const apiKey = resolveAnthropicKey();
  if (!apiKey) return { suggestion: "" };

  const file = await readGlassIdeProjectFile(projectRoot, rel);
  if (!file.ok || !file.content) return { suggestion: "" };

  const lines = file.content.split(/\r?\n/);
  const start = Math.max(0, line - CONTEXT_LINES - 1);
  const end = Math.min(lines.length, line + 2);
  const snippet = lines
    .slice(start, end)
    .map((content, idx) => {
      const n = start + idx + 1;
      const marker = n === line ? ">" : " ";
      return `${marker} ${String(n).padStart(4, " ")} | ${content}`;
    })
    .join("\n");

  const prompt = [
    "Complete ONLY the remainder of the current line in a code file.",
    "Rules:",
    "- Output the text that should appear AFTER the cursor on this line only.",
    "- No explanation, no markdown, no quotes, no newlines.",
    "- If unsure, output nothing.",
    "",
    `File: ${rel}`,
    `Line ${line} prefix (already typed): ${JSON.stringify(linePrefix)}`,
    "",
    "Context:",
    snippet,
  ].join("\n");

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 64,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return { suggestion: "" };
    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    return { suggestion: parseGhostSuggestion(text, linePrefix) };
  } catch {
    return { suggestion: "" };
  }
}
