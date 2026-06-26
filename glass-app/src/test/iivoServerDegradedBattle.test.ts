import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { resolveConfig } from "../shared/config.ts";
import {
  clearIivoServerDegraded,
  clearIivoServerDegradedSource,
  getIivoServerDegradedReason,
  isIivoServerDegradedForSource,
  markIivoServerDegraded,
} from "../main/iivoServerDegradedMain.ts";
import { translateViaServer } from "../main/liveTranslateClient.ts";
import { formatGlassAskErrorForUser } from "../shared/glassAskClientUtils.ts";
import { VOICE_ASK_STATUS } from "../shared/glassAskTiming.ts";

const TEST_TIMEOUT_MS = 10_000;

/** Track mock servers so a failed assertion cannot leave the process hanging for hours. */
const openServers: Server[] = [];

async function fetchHealth(apiUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 503
            ? "IIVO server temporarily unavailable (HTTP 503)."
            : `Health check failed (HTTP ${res.status}).`,
      };
    }
    const body = (await res.json()) as { ok?: boolean };
    return { ok: body.ok === true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function withMockServer(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer(handler);
    openServers.push(server);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: async () => {
          server.close();
          await once(server, "close");
          const idx = openServers.indexOf(server);
          if (idx >= 0) openServers.splice(idx, 1);
        },
      });
    });
  });
}

async function closeAllMockServers(): Promise<void> {
  const pending = [...openServers];
  openServers.length = 0;
  await Promise.all(
    pending.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
}

describe(
  "iivo server degraded battle",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  () => {
    afterEach(async () => {
      clearIivoServerDegraded();
      await closeAllMockServers();
    });

    test("503 health check marks degraded within one fetch", async () => {
      const mock = await withMockServer((_req, res) => {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("unavailable");
      });

      try {
        const result = await fetchHealth(mock.url);
        assert.equal(result.ok, false);
        assert.match(result.error ?? "", /503/i);

        markIivoServerDegraded("health", result.error);
        assert.match(getIivoServerDegradedReason() ?? "", /503|unavailable/i);
      } finally {
        await mock.close();
      }
    });

    test("health recovery clears degraded source", async () => {
      markIivoServerDegraded("health", "Ping failed.");

      const mock = await withMockServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });

      try {
        const result = await fetchHealth(mock.url);
        assert.equal(result.ok, true);

        clearIivoServerDegradedSource("health");
        assert.equal(getIivoServerDegradedReason(), undefined);
      } finally {
        await mock.close();
      }
    });

    test("translate success clears translate degraded mark", async () => {
      markIivoServerDegraded("translate", "Translation server unavailable.");

      const config = resolveConfig({ iivoApiUrl: "http://mock.local" });
      const result = await translateViaServer(
        config,
        {
          text: "Hello",
          sourceLanguage: "en",
          targetLanguage: "es",
        },
        async () =>
          new Response(JSON.stringify({ translated: "Hola" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      );

      assert.equal(result.translated, "Hola");
      assert.equal(isIivoServerDegradedForSource("translate"), false);
      assert.equal(getIivoServerDegradedReason(), undefined);
    });

    test("formatGlassAskErrorForUser maps provider outage and timeout copy", () => {
      assert.match(
        formatGlassAskErrorForUser(new Error("Anthropic API temporarily unavailable (503).")),
        /temporarily unavailable/i,
      );
      assert.equal(
        formatGlassAskErrorForUser(new Error(VOICE_ASK_STATUS.timeout)),
        VOICE_ASK_STATUS.timeout,
      );
      assert.match(
        formatGlassAskErrorForUser(new Error("Anthropic returned an empty answer.")),
        /empty response/i,
      );
    });
  },
);
