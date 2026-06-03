import type { ResearchAgentMeta } from "../types";

export interface SourceEntry {
  id: string;
  url?: string;
  title?: string;
  domain?: string;
  sourceType?: string;
  queryUsed?: string;
  website?: string;
  verificationStatus?: string;
  businessName?: string;
  kind: "entity" | "citation";
}

const URL_PATTERN = /^https?:\/\//i;

export function isSafeHttpUrl(value: string | undefined): value is string {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return undefined;
  }
}

function fieldValue(block: string, field: string): string | undefined {
  const re = new RegExp(`\\*\\*${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\*\\*\\s*(.+)$`, "im");
  const match = block.match(re);
  return match?.[1]?.trim();
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url.trim().toLowerCase();
  }
}

function entityIsLinkable(entry: Pick<SourceEntry, "url" | "verificationStatus">): boolean {
  if (!isSafeHttpUrl(entry.url)) return false;
  const status = entry.verificationStatus?.toLowerCase() ?? "";
  if (status.includes("not verified")) return false;
  return true;
}

export function parseEntitySourcesFromResearch(researchOutput: string): SourceEntry[] {
  if (!researchOutput.trim()) return [];

  const entries: SourceEntry[] = [];
  const blocks = researchOutput.split(/(?=### Entity \d+)/g);

  for (const block of blocks) {
    if (!/^### Entity \d+/m.test(block)) continue;

    const businessName = fieldValue(block, "Business name");
    const sourceUrl = fieldValue(block, "Source URL");
    const website = fieldValue(block, "Website");
    const sourceType = fieldValue(block, "Source type");
    const queryUsed = fieldValue(block, "Query used");
    const verificationStatus = fieldValue(block, "Verification status");

    const entry: SourceEntry = {
      id: `entity-${entries.length}-${businessName ?? "unknown"}`,
      title: businessName,
      businessName,
      sourceType,
      queryUsed,
      verificationStatus,
      kind: "entity",
    };

    if (entityIsLinkable({ url: sourceUrl, verificationStatus })) {
      entry.url = sourceUrl;
      entry.domain = extractDomain(sourceUrl!);
    }

    if (isSafeHttpUrl(website)) {
      entry.website = website;
      if (!entry.domain) entry.domain = extractDomain(website);
    }

    entries.push(entry);
  }

  return entries;
}

export function buildCitationSources(urls: string[]): SourceEntry[] {
  return urls
    .filter(isSafeHttpUrl)
    .map((url, index) => ({
      id: `citation-${index}-${normalizeUrl(url)}`,
      url,
      domain: extractDomain(url),
      title: extractDomain(url),
      kind: "citation" as const,
    }));
}

export function mergeSourceEntries(
  entitySources: SourceEntry[],
  citationUrls: string[] | undefined,
): SourceEntry[] {
  const seen = new Set<string>();
  const merged: SourceEntry[] = [];

  const add = (entry: SourceEntry) => {
    const keys = [entry.url, entry.website]
      .filter(isSafeHttpUrl)
      .map(normalizeUrl);
    if (keys.length === 0) {
      merged.push(entry);
      return;
    }
    const key = keys[0]!;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(entry);
  };

  for (const entry of entitySources) add(entry);

  if (citationUrls?.length) {
    for (const citation of buildCitationSources(citationUrls)) {
      if (citation.url && seen.has(normalizeUrl(citation.url))) continue;
      add(citation);
    }
  }

  return merged;
}

export function collectSources(options: {
  researchOutput?: string;
  researchSources?: string[];
  researchAgentMeta?: ResearchAgentMeta;
}): SourceEntry[] {
  const { researchOutput, researchSources, researchAgentMeta } = options;
  const entitySources =
    researchAgentMeta?.mode === "entity_search" && researchOutput
      ? parseEntitySourcesFromResearch(researchOutput)
      : [];

  const sources = mergeSourceEntries(entitySources, researchSources);

  if (sources.length === 0 && researchSources?.length) {
    return buildCitationSources(researchSources);
  }

  return sources;
}

export function sourceLinkLabel(entry: SourceEntry): string {
  if (entry.url) return entry.domain ?? entry.url;
  if (entry.website) return extractDomain(entry.website) ?? entry.website;
  return "Not verified";
}

export function hasRenderableSources(entries: SourceEntry[]): boolean {
  return entries.length > 0;
}

export function formatSourceType(sourceType?: string): string | undefined {
  if (!sourceType) return undefined;
  return sourceType.replace(/_/g, " ");
}

/** True when URL looks like a bare link worth autolinking in plain text fallback. */
export function looksLikeUrl(text: string): boolean {
  return URL_PATTERN.test(text.trim());
}
