/**
 * Live-mode stub handle when E2E uses the real IIVO server (no local stub HTTP).
 */
import type { StubServerHandle } from "./stubServer.ts";

export function createLiveE2eHandle(baseUrl: string): StubServerHandle {
  return {
    baseUrl,
    port: 0,
    close: async () => undefined,
    getAskCallCount: () => 0,
    getLastAskBody: () => null,
    getLastContextBody: () => null,
    getScreenshotUploadCount: () => 0,
    getHandoffVisits: () => [],
    resetHandoffState: () => undefined,
    getMemoryPostCount: () => 0,
    getLastMemoryBody: () => null,
  };
}

export async function assertLiveServerReachable(apiUrl: string): Promise<void> {
  const url = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`Live E2E requires IIVO server at ${url} (HTTP ${res.status}). Run: npm run dev`);
  }
  const health = (await res.json()) as { ok?: boolean };
  if (!health.ok) {
    throw new Error(`IIVO health check failed at ${url}/api/health`);
  }
}

export function resolveLiveApiUrls(): { apiUrl: string; webUrl: string } {
  const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const webUrl = (process.env.IIVO_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return { apiUrl, webUrl };
}
