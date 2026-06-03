import type {
  AttachedContextItem,
  ContextItem,
  CreateContextItemInput,
  ExternalContextPayload,
  ImageVisionConfig,
} from "../types/contextBridge";

export async function fetchContextItems(): Promise<ContextItem[]> {
  const res = await fetch("/api/context");
  if (!res.ok) throw new Error("Could not load context library");
  const data = (await res.json()) as { items: ContextItem[] };
  return data.items ?? [];
}

export async function fetchContextItem(id: string): Promise<ContextItem> {
  const res = await fetch(`/api/context/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Context item not found");
  return res.json() as Promise<ContextItem>;
}

export async function createContextItem(input: CreateContextItemInput): Promise<ContextItem> {
  const res = await fetch("/api/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Could not save context");
  return res.json() as Promise<ContextItem>;
}

export async function deleteContextItem(id: string): Promise<void> {
  const res = await fetch(`/api/context/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Could not delete context item");
}

export async function importContextUrl(url: string): Promise<{
  title: string;
  sourceUrl: string;
  contentText: string;
  contentSummary?: string;
  extractedAt: string;
}> {
  const res = await fetch("/api/context/import-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "URL import failed");
  }
  return data;
}

export async function saveContextToMemory(id: string): Promise<void> {
  const res = await fetch(`/api/context/${id}/save-memory`, { method: "POST" });
  if (!res.ok) throw new Error("Could not save to memory");
}

export async function fetchVisionConfig(): Promise<ImageVisionConfig> {
  const res = await fetch("/api/config/vision");
  if (!res.ok) throw new Error("Could not load vision config");
  return res.json() as Promise<ImageVisionConfig>;
}

export function toExternalContextPayload(
  items: AttachedContextItem[],
): ExternalContextPayload | undefined {
  if (items.length === 0) return undefined;
  return {
    items: items.map((item) => ({
      id: item.savedId ?? item.id,
      type: item.type,
      title: item.title,
      sourceUrl: item.sourceUrl,
      contentText: item.contentText,
      contentSummary: item.contentSummary,
      tags: item.tags,
      savedToLibrary: !item.ephemeral && Boolean(item.savedId),
    })),
  };
}
