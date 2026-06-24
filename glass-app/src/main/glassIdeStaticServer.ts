/**
 * Glass IDE — minimal static file server for index.html preview fallback.
 * Serves only under a single directory on 127.0.0.1 (loopback).
 */

import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as path from "node:path";
import { expandAgentPath } from "./agentCoderTools.ts";
import { isAllowedPreviewUrl } from "../shared/glassIdePreview.ts";

const STATIC_INDEX_CANDIDATES: Array<{ file: string; subdir: string }> = [
  { file: "index.html", subdir: "." },
  { file: "index.html", subdir: "public" },
  { file: "index.html", subdir: "dist" },
  { file: "index.html", subdir: "build" },
];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

let activeServer: http.Server | null = null;
let activeServeRoot: string | null = null;
let activeUrl: string | null = null;

function mimeFor(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function safeResolveUnderRoot(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const relative = decoded.replace(/^\/+/, "");
  const abs = path.resolve(root, relative || ".");
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

export async function findStaticPreviewServeDir(
  projectRoot: string,
): Promise<string | null> {
  const root = path.resolve(expandAgentPath(projectRoot.trim()));
  for (const candidate of STATIC_INDEX_CANDIDATES) {
    const serveDir = candidate.subdir === "."
      ? root
      : path.join(root, candidate.subdir);
    const indexPath = path.join(serveDir, candidate.file);
    try {
      const stat = await fs.stat(indexPath);
      if (stat.isFile()) return serveDir;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function getActiveStaticPreviewUrl(): string | null {
  return activeUrl;
}

export async function stopStaticPreviewServer(): Promise<void> {
  const server = activeServer;
  activeServer = null;
  activeServeRoot = null;
  activeUrl = null;
  if (!server) return;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

export async function startStaticPreviewServer(serveDir: string): Promise<string> {
  const resolved = path.resolve(serveDir);
  if (activeServer && activeServeRoot === resolved && activeUrl) {
    return activeUrl;
  }

  await stopStaticPreviewServer();

  const server = http.createServer((req, res) => {
    const root = activeServeRoot;
    if (!root || !req.url) {
      res.writeHead(500);
      res.end();
      return;
    }

    let filePath = safeResolveUnderRoot(root, req.url);
    if (!filePath) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    void (async () => {
      try {
        let stat = await fs.stat(filePath!);
        if (stat.isDirectory()) {
          filePath = path.join(filePath!, "index.html");
          stat = await fs.stat(filePath);
        }
        if (!stat.isFile()) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const body = await fs.readFile(filePath);
        res.writeHead(200, { "Content-Type": mimeFor(filePath) });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    })();
  });

  const url = await new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind static preview server"));
        return;
      }
      const candidate = `http://127.0.0.1:${addr.port}/`;
      if (!isAllowedPreviewUrl(candidate)) {
        reject(new Error("Static preview URL not allowed"));
        return;
      }
      resolve(candidate);
    });
  });

  activeServer = server;
  activeServeRoot = resolved;
  activeUrl = url;
  return url;
}

export async function maybeStartStaticIdePreview(projectRoot: string): Promise<string | null> {
  const serveDir = await findStaticPreviewServeDir(projectRoot);
  if (!serveDir) return null;
  return startStaticPreviewServer(serveDir);
}
