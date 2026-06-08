/**
 * Thin client for the existing IIVO Context Bridge API. Uses the global fetch
 * (Node 18+/Electron main). No new endpoints are introduced.
 */

import {
  buildContextApiUrl,
  buildScreenshotApiUrl,
  type GlassConfig,
} from "./config.ts";
import { withIivoApiAuthHeaders } from "./iivoApiAuth.ts";
import type { ContextCreatePayload } from "./types.ts";

export interface CreatedContextItem {
  id: string;
  type: string;
  title: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: withIivoApiAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      // ignore body read errors
    }
    throw new Error(`IIVO API ${res.status} ${res.statusText} at ${url} ${detail}`.trim());
  }
  return (await res.json()) as T;
}

export async function createContextItem(
  config: GlassConfig,
  payload: ContextCreatePayload,
): Promise<CreatedContextItem> {
  return postJson<CreatedContextItem>(buildContextApiUrl(config), payload);
}

export async function uploadScreenshot(
  config: GlassConfig,
  contextId: string,
  imageDataUrl: string,
): Promise<void> {
  await postJson(buildScreenshotApiUrl(config, contextId), { imageDataUrl });
}

/** Full screenshot handoff: create the context item, then upload the image. */
export async function createScreenshotContext(
  config: GlassConfig,
  payload: ContextCreatePayload,
  imageDataUrl: string,
): Promise<CreatedContextItem> {
  const item = await createContextItem(config, payload);
  await uploadScreenshot(config, item.id, imageDataUrl);
  return item;
}
