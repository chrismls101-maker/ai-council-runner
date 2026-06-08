import http from "node:http";
import type { AddressInfo } from "node:net";

export interface StubServerOptions {
  askDelayMs?: number;
}

export interface StubServerHandle {
  baseUrl: string;
  port: number;
  close: () => Promise<void>;
  getAskCallCount: () => number;
  getLastAskBody: () => Record<string, unknown> | null;
  getLastContextBody: () => Record<string, unknown> | null;
  getScreenshotUploadCount: () => number;
  getHandoffVisits: () => string[];
  resetHandoffState: () => void;
  getMemoryPostCount: () => number;
  getLastMemoryBody: () => Record<string, unknown> | null;
}

const STUB_ASK_RESPONSE = {
  answer: "You are testing IIVO Glass. The command bar is working.",
  shortAnswer: "IIVO Glass is working.",
  routeUsed: "glass_direct",
  model: "e2e-stub",
};

const STUB_VISUAL_ASK_RESPONSE = {
  answer: "I can see the test screen.",
  shortAnswer: "I can see the test screen.",
  routeUsed: "glass_visual_direct",
  usedVision: true,
  model: "e2e-stub-vision",
};

function buildStubAskResponse(prompt: string, visual: boolean): typeof STUB_ASK_RESPONSE {
  const base = visual ? STUB_VISUAL_ASK_RESPONSE : STUB_ASK_RESPONSE;
  const trimmed = prompt.trim();
  const quoted = trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed;
  const answer = trimmed
    ? `You asked: "${quoted}". ${base.answer}`
    : base.answer;
  const shortAnswer = trimmed
    ? `Re: "${quoted.length > 72 ? `${quoted.slice(0, 69)}…` : quoted}" — ${base.shortAnswer}`
    : base.shortAnswer;
  return {
    ...base,
    answer,
    shortAnswer,
  };
}

export async function startStubServer(
  options: StubServerOptions = {},
): Promise<StubServerHandle> {
  let askCallCount = 0;
  let lastAskBody: Record<string, unknown> | null = null;
  let lastContextBody: Record<string, unknown> | null = null;
  let screenshotUploadCount = 0;
  const handoffVisits: string[] = [];
  let memoryPostCount = 0;
  let lastMemoryBody: Record<string, unknown> | null = null;
  let delayMs = options.askDelayMs ?? 0;
  let force413Once = false;

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "GET" && (url === "/health" || url === "/api/health")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            vision: { enabled: true, configured: true },
            stt: { configured: true, endpoint: "/api/transcribe-audio" },
          }),
        );
        return;
      }

      if (req.method === "GET" && url === "/api/config/vision") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ enabled: true, configured: true }));
        return;
      }

      if (req.method === "GET" && (url === "/" || url.startsWith("/?") || url.includes("lensAsk="))) {
        handoffVisits.push(url);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<!DOCTYPE html><html><body>IIVO Glass E2E handoff</body></html>");
        return;
      }

      if (req.method === "POST" && url === "/api/glass/ask") {
        askCallCount += 1;
        let prompt = "";
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(bodyText) as Record<string, unknown>;
          lastAskBody = parsed;
          prompt = String(parsed.prompt ?? "");
        } catch {
          lastAskBody = null;
        }
        const responseDelay = prompt.includes("E2E_DELAY_ASK") ? Math.max(delayMs, 2500) : 0;

        const visual =
          parsed?.visualIntent === true ||
          (parsed?.latestScreenshot != null && typeof parsed.latestScreenshot === "object");

        if (visual && prompt.includes("E2E_FORCE_413_ONCE") && !force413Once) {
          force413Once = true;
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Payload Too Large" }));
          return;
        }

        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(buildStubAskResponse(prompt, visual)));
        }, responseDelay);
        return;
      }

      if (req.method === "POST" && url === "/api/context") {
        try {
          lastContextBody = JSON.parse(bodyText) as Record<string, unknown>;
        } catch {
          lastContextBody = null;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "ctx-e2e-1",
            type: "screenshot",
            title: "IIVO Glass E2E context",
          }),
        );
        return;
      }

      if (req.method === "POST" && /^\/api\/context\/[^/]+\/screenshot$/.test(url)) {
        screenshotUploadCount += 1;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "POST" && url === "/api/memory") {
        memoryPostCount += 1;
        try {
          lastMemoryBody = JSON.parse(bodyText) as Record<string, unknown>;
        } catch {
          lastMemoryBody = null;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, id: "mem-e2e-1" }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found", path: url }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    getAskCallCount: () => askCallCount,
    getLastAskBody: () => lastAskBody,
    getLastContextBody: () => lastContextBody,
    getScreenshotUploadCount: () => screenshotUploadCount,
    getHandoffVisits: () => [...handoffVisits],
    resetHandoffState: () => {
      lastContextBody = null;
      screenshotUploadCount = 0;
      handoffVisits.length = 0;
    },
    getMemoryPostCount: () => memoryPostCount,
    getLastMemoryBody: () => lastMemoryBody,
  };
}

export function setStubAskDelay(handle: StubServerHandle, ms: number): void {
  void handle;
  void ms;
}
