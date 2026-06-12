/**
 * IIVO Glass — Agent Proxy Server
 *
 * A lightweight local HTTP server that intercepts Anthropic API calls from
 * AI coding tools (Claude Code, Cursor, etc.) and forwards them transparently
 * to the real Anthropic API.
 *
 * Usage:
 *   User sets ANTHROPIC_BASE_URL=http://localhost:7421 in their shell.
 *   Their tools route through this proxy automatically.
 *   Glass captures a privacy-minimized summary of each call.
 *
 * Privacy guarantees (enforced here + in agentProxy.ts):
 *   - API keys are stripped BEFORE any logging — the proxy reads the key
 *     from x-api-key to forward the request, then discards it immediately.
 *   - Only snippets of request/response content are retained.
 *   - Tool call inputs/outputs are never stored.
 *   - The server binds to 127.0.0.1 only — never exposed to the network.
 *   - The server is completely stopped when the session ends.
 */

import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";

import {
  sanitizeHeaders,
  extractRequestSnippets,
  extractResponseSnippets,
  extractStreamingSnippets,
  buildAgentCallSummary,
  type AgentCallSummary,
} from "../shared/agentProxy.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentProxyOptions {
  /** Port to listen on. Default: 7421. */
  port?: number;
  /** Called whenever a complete agent call has been captured. */
  onCall: (summary: AgentCallSummary) => void;
  /** Called on proxy errors (non-fatal). */
  onError?: (err: Error) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTHROPIC_HOST = "api.anthropic.com";
const ANTHROPIC_PORT = 443;
const DEFAULT_PORT = 7421;
const BIND_HOST = "127.0.0.1"; // never bind to 0.0.0.0

/** Max bytes to accumulate from a streaming response for snippet extraction.
 *  extractStreamingSnippets only reads the first ~300 chars anyway — this cap
 *  prevents a runaway large response from consuming unbounded memory. */
const MAX_SSE_ACCUMULATE_BYTES = 50_000;

// ─── Proxy Server ─────────────────────────────────────────────────────────────

export class AgentProxyServer {
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly onCall: (summary: AgentCallSummary) => void;
  private readonly onError: (err: Error) => void;

  constructor(options: AgentProxyOptions) {
    this.port = options.port ?? DEFAULT_PORT;
    this.onCall = options.onCall;
    this.onError = options.onError ?? ((err) => console.error("[AgentProxy] error:", err.message));
  }

  /** Start the proxy server. Returns the actual port bound. */
  async start(): Promise<number> {
    if (this.server) return this.port;

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          reject(new Error(`Agent proxy port ${this.port} is already in use. Choose a different port in Settings.`));
        } else {
          reject(err);
        }
      });

      server.listen(this.port, BIND_HOST, () => {
        this.server = server;
        resolve(this.port);
      });
    });
  }

  /** Stop the proxy server immediately. */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  get isRunning(): boolean {
    return this.server !== null;
  }

  get activePort(): number {
    return this.port;
  }

  // ─── Request handling ────────────────────────────────────────────────────────

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Collect the request body
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const bodyBuffer = Buffer.concat(chunks);
      this.forwardRequest(req, res, bodyBuffer);
    });
    req.on("error", (err) => {
      this.onError(err);
      res.writeHead(502);
      res.end();
    });
  }

  private forwardRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    bodyBuffer: Buffer,
  ): void {
    const timestamp = Date.now();
    const callId = randomUUID();

    // Extract API key BEFORE sanitizing (needed to forward) — never logged
    const apiKey =
      (req.headers["x-api-key"] as string | undefined) ??
      (req.headers["authorization"] as string | undefined)?.replace(/^Bearer\s+/i, "") ??
      "";

    // Sanitize headers — API key is now gone from our logging layer
    const safeHeaders = sanitizeHeaders(req.headers as Record<string, string | string[] | undefined>);

    // Determine if this is an Anthropic Messages API call worth capturing
    const isMessagesCall = (req.url ?? "").includes("/messages");

    // Parse request body for snippet extraction
    let parsedBody: unknown = null;
    let requestSnippets: ReturnType<typeof extractRequestSnippets> | null = null;
    if (isMessagesCall && bodyBuffer.length > 0) {
      try {
        parsedBody = JSON.parse(bodyBuffer.toString("utf8"));
        requestSnippets = extractRequestSnippets(parsedBody);
      } catch {
        // Ignore parse errors — we'll still proxy the request
      }
    }

    // Build forwarding headers — restore API key for the upstream request
    const forwardHeaders: Record<string, string> = {
      "content-type": req.headers["content-type"] ?? "application/json",
      "anthropic-version": (req.headers["anthropic-version"] as string) ?? "2023-06-01",
      "host": ANTHROPIC_HOST,
    };
    if (apiKey) forwardHeaders["x-api-key"] = apiKey;
    if (req.headers["anthropic-beta"]) {
      forwardHeaders["anthropic-beta"] = req.headers["anthropic-beta"] as string;
    }
    if (bodyBuffer.length > 0) {
      forwardHeaders["content-length"] = String(bodyBuffer.length);
    }

    // Detect streaming
    const isStreaming = requestSnippets?.wasStreaming ?? false;

    // Forward to Anthropic
    const upstreamReq = https.request(
      {
        hostname: ANTHROPIC_HOST,
        port: ANTHROPIC_PORT,
        path: req.url,
        method: req.method ?? "POST",
        headers: forwardHeaders,
      },
      (upstreamRes) => {
        // Forward status + headers back to client immediately
        res.writeHead(upstreamRes.statusCode ?? 200, upstreamRes.headers);

        if (isStreaming && isMessagesCall && requestSnippets) {
          this.handleStreamingResponse(
            upstreamRes, res, callId, timestamp, requestSnippets,
          );
        } else {
          this.handleBufferedResponse(
            upstreamRes, res, callId, timestamp, requestSnippets,
          );
        }
      },
    );

    upstreamReq.on("error", (err) => {
      this.onError(err);
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });

    upstreamReq.write(bodyBuffer);
    upstreamReq.end();
  }

  // ─── Buffered (non-streaming) response ───────────────────────────────────────

  private handleBufferedResponse(
    upstreamRes: http.IncomingMessage,
    clientRes: http.ServerResponse,
    callId: string,
    timestamp: number,
    requestSnippets: ReturnType<typeof extractRequestSnippets> | null,
  ): void {
    const chunks: Buffer[] = [];
    upstreamRes.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      clientRes.write(chunk);
    });
    upstreamRes.on("end", () => {
      clientRes.end();

      if (!requestSnippets) return; // non-messages call, skip capture

      const bodyText = Buffer.concat(chunks).toString("utf8");
      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(bodyText);
      } catch {
        return; // non-JSON response, skip
      }

      const responseSnippets = extractResponseSnippets(parsedResponse);
      const summary = buildAgentCallSummary(callId, timestamp, requestSnippets, responseSnippets);
      this.onCall(summary);
    });
  }

  // ─── Streaming (SSE) response ─────────────────────────────────────────────────

  private handleStreamingResponse(
    upstreamRes: http.IncomingMessage,
    clientRes: http.ServerResponse,
    callId: string,
    timestamp: number,
    requestSnippets: ReturnType<typeof extractRequestSnippets>,
  ): void {
    // Accumulate SSE for snippet extraction, but forward each chunk immediately
    // so the client sees real-time streaming with zero added latency.
    let accumulated = "";

    upstreamRes.on("data", (chunk: Buffer) => {
      // Forward immediately — no buffering from the client's perspective
      clientRes.write(chunk);
      // Accumulate for snippet extraction — capped so a long response doesn't
      // consume unbounded memory. extractStreamingSnippets only needs ~300 chars.
      if (accumulated.length < MAX_SSE_ACCUMULATE_BYTES) {
        accumulated += chunk.toString("utf8");
      }
    });

    upstreamRes.on("end", () => {
      clientRes.end();
      const responseSnippets = extractStreamingSnippets(accumulated);
      const summary = buildAgentCallSummary(callId, timestamp, requestSnippets, responseSnippets);
      this.onCall(summary);
    });
  }
}

// ─── Port availability check ──────────────────────────────────────────────────

/**
 * Check if a port is available on localhost.
 * Used before starting the proxy to give a better error message.
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, BIND_HOST);
  });
}

/**
 * Find the next available port starting from preferredPort.
 * Tries up to 5 ports before giving up.
 */
export async function findAvailablePort(preferredPort: number): Promise<number | null> {
  for (let i = 0; i < 5; i++) {
    if (await isPortAvailable(preferredPort + i)) {
      return preferredPort + i;
    }
  }
  return null;
}
