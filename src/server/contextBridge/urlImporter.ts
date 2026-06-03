import type { ImportUrlResult } from "./types.js";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_IMPORT_CHARS = 12_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function stripHtml(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return text.replace(/\s+/g, " ").trim();
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  return stripHtml(match[1]).slice(0, 200) || undefined;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateOrLocalUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (url.protocol === "file:") return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]") {
    return true;
  }
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  if (isPrivateIpv4(host)) return true;
  return false;
}

async function readResponseTextLimited(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const len = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(len) && len > MAX_RESPONSE_BYTES) {
      throw new Error("Page is too large to import automatically.");
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("Page is too large to import automatically.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      throw new Error("Page is too large to import automatically.");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

export async function importUrlContent(rawUrl: string): Promise<ImportUrlResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Invalid URL.");
  }

  if (parsed.protocol === "file:") {
    throw new Error(
      "file:// URLs are not supported. Paste the relevant text instead.",
    );
  }

  if (isPrivateOrLocalUrl(parsed)) {
    throw new Error(
      "This looks like a private or local page. IIVO cannot import logged-in chats or private pages automatically — paste the relevant text instead.",
    );
  }

  const extractedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "IIVO-ContextBridge/1.0",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Fetch failed (${response.status}).`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = await readResponseTextLimited(response);

    if (contentType.includes("text/html") || body.includes("<html")) {
      const title = extractTitle(body) ?? parsed.hostname;
      let contentText = stripHtml(body);
      if (contentText.length > MAX_IMPORT_CHARS) {
        contentText = `${contentText.slice(0, MAX_IMPORT_CHARS)}\n\n[Imported page text truncated.]`;
      }
      if (contentText.length < 40) {
        throw new Error("Page had too little readable text.");
      }
      return {
        title,
        sourceUrl: parsed.toString(),
        contentText,
        contentSummary: contentText.slice(0, 280),
        extractedAt,
      };
    }

    if (contentType.includes("text/plain") || contentType.includes("text/markdown")) {
      const contentText =
        body.length > MAX_IMPORT_CHARS
          ? `${body.slice(0, MAX_IMPORT_CHARS)}\n\n[Imported text truncated.]`
          : body.trim();
      return {
        title: parsed.hostname,
        sourceUrl: parsed.toString(),
        contentText,
        contentSummary: contentText.slice(0, 280),
        extractedAt,
      };
    }

    throw new Error("Unsupported content type for automatic import.");
  } catch (err) {
    if (err instanceof Error) {
      if (
        err.message.includes("private or local") ||
        err.message.includes("file://") ||
        err.message.includes("too large")
      ) {
        throw err;
      }
      if (err.name === "AbortError") {
        throw new Error("URL import timed out. Paste the relevant text instead.");
      }
    }
    throw new Error(
      "IIVO could not import this URL automatically. Paste the relevant text instead.",
    );
  } finally {
    clearTimeout(timer);
  }
}
