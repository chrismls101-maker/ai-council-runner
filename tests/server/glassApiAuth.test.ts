/**
 * Glass API auth is scoped to costly Glass endpoints, not the public web API.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { glassApiAuthMiddleware } from "../../dist/server/middleware/glassApiAuth.js";

function listen(app: express.Express): Promise<{ base: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no port"));
        return;
      }
      resolve({
        base: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      });
    });
  });
}

test("health is public when GLASS_API_SECRET is set", async () => {
  const prev = process.env.GLASS_API_SECRET;
  process.env.GLASS_API_SECRET = "test-secret";
  const app = express();
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.post("/api/glass/ask", glassApiAuthMiddleware, (_req, res) => res.json({ ok: true }));

  const { base, close } = await listen(app);
  try {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);

    const askNoAuth = await fetch(`${base}/api/glass/ask`, { method: "POST" });
    assert.equal(askNoAuth.status, 401);

    const askAuth = await fetch(`${base}/api/glass/ask`, {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });
    assert.equal(askAuth.status, 200);
  } finally {
    close();
    if (prev === undefined) delete process.env.GLASS_API_SECRET;
    else process.env.GLASS_API_SECRET = prev;
  }
});
