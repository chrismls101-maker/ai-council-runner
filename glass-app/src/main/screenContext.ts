/**
 * Screen-aware file detection for Glass Coder — Haiku vision on screenshot.
 */

import type { AgentScreenContext } from "../shared/ipc.ts";
import {
  SCREEN_DETECT_TIMEOUT_MS,
  screenDetectTimeout,
} from "../shared/screenDetect.ts";
import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const FILE_DETECT_PROMPT = `Look at this screenshot of a macOS screen.

Identify:
1. What editor/IDE is open (VS Code, Xcode, Sublime Text, JetBrains, Vim, etc.)
2. The full file path of the currently active/focused file tab (look at the tab bar, title bar, or breadcrumb)
3. Any visible error messages or red squiggles

Respond in JSON only:
{
  "editor": "VS Code" | null,
  "filePath": "/absolute/path/to/file.ts" | null,
  "lineNumber": 42 | null,
  "errors": ["error text"] | [],
  "confidence": "high" | "low"
}

If the file path shown is relative, try to infer the absolute path from any project name visible in the sidebar or title bar. If you cannot determine it with confidence, set filePath to null.`;

export interface ScreenFileContext {
  filePath: string | null;
  editorName: string | null;
  lineNumber?: number;
  visibleErrors?: string[];
  confidence: "high" | "low";
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

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) {
    return { mediaType: "image/png", base64: dataUrl };
  }
  return { mediaType: match[1], base64: match[2] };
}

function parseScreenFileJson(text: string): ScreenFileContext | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      editor?: string | null;
      filePath?: string | null;
      lineNumber?: number | null;
      errors?: string[];
      confidence?: string;
    };
    return {
      filePath: typeof parsed.filePath === "string" ? parsed.filePath : null,
      editorName: typeof parsed.editor === "string" ? parsed.editor : null,
      lineNumber: typeof parsed.lineNumber === "number" ? parsed.lineNumber : undefined,
      visibleErrors: Array.isArray(parsed.errors)
        ? parsed.errors.filter((e): e is string => typeof e === "string")
        : undefined,
      confidence: parsed.confidence === "high" ? "high" : "low",
    };
  } catch {
    return null;
  }
}

export async function detectActiveFile(
  screenshotBase64: string,
): Promise<ScreenFileContext> {
  const fallback: ScreenFileContext = {
    filePath: null,
    editorName: null,
    confidence: "low",
  };

  const apiKey = resolveAnthropicKey();
  if (!apiKey) return fallback;

  const { mediaType, base64 } = parseDataUrl(screenshotBase64);

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
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: FILE_DETECT_PROMPT },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(SCREEN_DETECT_TIMEOUT_MS + 500),
    });

    if (!res.ok) return fallback;

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = json.content?.find((b) => b.type === "text")?.text ?? "";
    return parseScreenFileJson(text) ?? fallback;
  } catch (err) {
    console.warn("[screenContext] detectActiveFile failed:", err);
    return fallback;
  }
}

export function formatScreenContextForCoder(ctx: ScreenFileContext): string {
  const lines: string[] = [];
  if (ctx.editorName) lines.push(`Editor: ${ctx.editorName}`);
  if (ctx.filePath) lines.push(`Detected active file: ${ctx.filePath}`);
  if (ctx.lineNumber != null) lines.push(`Line: ${ctx.lineNumber}`);
  if (ctx.visibleErrors?.length) {
    lines.push(`Visible errors: ${ctx.visibleErrors.join("; ")}`);
  }
  return lines.join("\n");
}

export function toAgentScreenContext(detected: ScreenFileContext): AgentScreenContext {
  return {
    detectedFilePath: detected.filePath ?? undefined,
    editorName: detected.editorName ?? undefined,
    visibleErrors: detected.visibleErrors,
    confidence: detected.confidence,
  };
}

export async function detectAgentScreenContextFromScreenshot(
  screenshotBase64: string,
  timeoutMs = SCREEN_DETECT_TIMEOUT_MS,
): Promise<AgentScreenContext> {
  const fallback: ScreenFileContext = {
    filePath: null,
    editorName: null,
    confidence: "low",
  };
  const detected = await screenDetectTimeout(
    () => detectActiveFile(screenshotBase64),
    timeoutMs,
    fallback,
  );
  return toAgentScreenContext(detected);
}

function screenCaptureErrorContext(err: unknown): AgentScreenContext {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("Screen Recording")
    || msg.includes("permission")
    || msg.includes("empty image")
  ) {
    return {
      confidence: "low",
      detectError: "Screen Recording permission required — enable it for IIVO Glass in System Settings.",
    };
  }
  return { confidence: "low" };
}

/** Capture primary display + Haiku detect, capped at timeoutMs end-to-end. */
export async function detectAgentScreenContextFromCapture(
  capture: () => Promise<{ imageDataUrl: string }>,
  timeoutMs = SCREEN_DETECT_TIMEOUT_MS,
): Promise<AgentScreenContext> {
  const fallback: AgentScreenContext = { confidence: "low" };
  return screenDetectTimeout(async () => {
    try {
      const shot = await capture();
      const detected = await detectActiveFile(shot.imageDataUrl);
      return toAgentScreenContext(detected);
    } catch (err) {
      return screenCaptureErrorContext(err);
    }
  }, timeoutMs, fallback);
}
