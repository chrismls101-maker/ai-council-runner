/**
 * IIVO Glass — QA HTTP Bridge
 *
 * Exposes a minimal HTTP server on port 7842 so external QA scripts can read
 * state and dispatch commands without going through Electron IPC.
 *
 * ONLY active when IIVO_GLASS_TEST=1.  Never ships to users.
 *
 * Endpoints:
 *   GET  /api/state           → JSON snapshot of current GlassState
 *   POST /api/command         → dispatch a GlassCommand (body: JSON)
 *   GET  /api/health          → { ok: true }
 *
 * Auth: every request must carry the header  x-glass-secret: <GLASS_API_SECRET>
 */

import * as http from "node:http";
import type { GlassState, GlassCommand } from "../shared/ipc.ts";

const QA_PORT = 7842;

export function startGlassQaBridge(opts: {
  secret: string;
  getState: () => GlassState;
  runCommand: (cmd: GlassCommand) => Promise<void>;
}): void {
  const { secret, getState, runCommand } = opts;

  const server = http.createServer((req, res) => {
    // ── Auth ────────────────────────────────────────────────────────────────
    const incoming = req.headers["x-glass-secret"] ?? "";
    if (!secret || incoming !== secret) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const url = req.url ?? "/";

    // ── GET /api/health ─────────────────────────────────────────────────────
    if (req.method === "GET" && url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // ── GET /api/state ──────────────────────────────────────────────────────
    if (req.method === "GET" && url === "/api/state") {
      let body: string;
      try {
        body = JSON.stringify(getState());
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
      return;
    }

    // ── POST /api/command ───────────────────────────────────────────────────
    if (req.method === "POST" && url === "/api/command") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        let cmd: GlassCommand;
        try {
          cmd = JSON.parse(Buffer.concat(chunks).toString("utf8")) as GlassCommand;
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON" }));
          return;
        }

        runCommand(cmd)
          .then(() => {
            // Return state after command so callers can inspect it immediately
            let responseBody: string;
            try {
              responseBody = JSON.stringify({ ok: true, state: getState() });
            } catch {
              responseBody = JSON.stringify({ ok: true });
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(responseBody);
          })
          .catch((err: unknown) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          });
      });
      return;
    }

    // ── 404 ─────────────────────────────────────────────────────────────────
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[GlassQA] Port ${QA_PORT} already in use — bridge not started`);
    } else {
      console.error("[GlassQA] Server error:", err);
    }
  });

  server.listen(QA_PORT, "127.0.0.1", () => {
    console.log(`[GlassQA] HTTP bridge listening on http://127.0.0.1:${QA_PORT}`);
  });
}
