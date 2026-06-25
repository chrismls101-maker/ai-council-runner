#!/usr/bin/env node
/**
 * Battle-test IIVO server degraded indicator + Anthropic ask error paths.
 *
 * Usage:
 *   node scripts/glass-server-degraded-battle.mjs
 *   node scripts/glass-server-degraded-battle.mjs --anthropic-timeout-ms 1
 *
 * Manual Glass dev (separate terminal):
 *   IIVO_API_URL=http://127.0.0.1:<port> npm run dev
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:<port> ANTHROPIC_TIMEOUT_MS=1 npm run dev
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const glassAppDir = join(scriptDir, "..");

function parseArgs(argv) {
  const out = { anthropicTimeoutMs: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--anthropic-timeout-ms" && argv[i + 1]) {
      out.anthropicTimeoutMs = Number.parseInt(argv[++i], 10);
    }
  }
  return out;
}

function startMockServer(mode) {
  let healthMode = mode;
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url ?? "/";

      if (path === "/api/health") {
        if (healthMode === "503") {
          res.writeHead(503);
          res.end("service unavailable");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, vision: { enabled: true, configured: true } }));
        return;
      }

      if (path === "/v1/messages" && req.method === "POST") {
        if (healthMode === "anthropic-503") {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "overloaded" } }));
          return;
        }
        if (healthMode === "anthropic-malformed") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: "msg_bad", type: "message", role: "assistant", content: [] }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "msg_ok",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "Battle test OK." }],
            model: "claude-test",
            stop_reason: "end_turn",
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end("not found");
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        setMode: (next) => {
          healthMode = next;
        },
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

async function runNodeTest(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "--test", file],
      { cwd: glassAppDir, stdio: "inherit" },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${file} failed (${code})`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  console.log("=== Glass server degraded battle test ===\n");

  const mock = await startMockServer("503");
  console.log(`Mock server: ${mock.url}`);
  console.log("Phase 1: IIVO health 503 → degraded reason");
  process.env.IIVO_API_URL = mock.url;
  await runNodeTest("src/test/iivoServerDegradedBattle.test.ts");

  console.log("\nPhase 2: recovery → health 200");
  mock.setMode("ok");
  await runNodeTest("src/test/iivoServerDegradedBattle.test.ts");

  console.log("\nPhase 3: Anthropic 503 via mock /v1/messages");
  mock.setMode("anthropic-503");
  console.log(`  Set ANTHROPIC_BASE_URL=${mock.url} and ask in Glass — expect friendly outage copy.`);

  console.log("\nPhase 4: Anthropic malformed 200");
  mock.setMode("anthropic-malformed");
  console.log("  Expect empty-response message, no crash.");

  if (args.anthropicTimeoutMs) {
    console.log(`\nPhase 5: timeout simulation ANTHROPIC_TIMEOUT_MS=${args.anthropicTimeoutMs}`);
    console.log(`  Also set IIVO_GLASS_ASK_TIMEOUT_MS=${args.anthropicTimeoutMs}`);
  }

  console.log("\nPanel indicator: open Glass panel — look for data-testid=glass-server-degraded-indicator");
  console.log("Restore: unset IIVO_API_URL / ANTHROPIC_BASE_URL overrides and relaunch.\n");

  await mock.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
