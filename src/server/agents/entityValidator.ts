import type { PerplexitySearchResult } from "../providers/perplexitySearch.js";

export type VerificationStatus = "Verified" | "Partially verified" | "Not verified";

export interface EntityCandidate {
  business_name: string;
  category: string;
  location: string;
  source_url: string;
  source_type: string;
  website?: string;
  phone?: string;
  evidence_from_snippet: string;
  verification_status: VerificationStatus;
  missing_info: string[];
  query_used: string;
}

export interface EntitySearchOutcome {
  status: "found" | "not_found";
  candidates: EntityCandidate[];
  reason?: string;
  suggested_queries?: string[];
  rejected_count: number;
}

const REJECT_URL_PATTERNS = [
  /\/blog\//i,
  /\/news\//i,
  /\/article/i,
  /medium\.com/i,
  /substack\.com/i,
  /youtube\.com/i,
  /youtu\.be/i,
  /reddit\.com/i,
  /quora\.com/i,
  /wikipedia\.org/i,
  /forbes\.com/i,
  /techcrunch\.com/i,
  /businessinsider\.com/i,
  /hbr\.org/i,
  /openai\.com/i,
  /anthropic\.com/i,
  /perplexity\.ai/i,
];

const REJECT_TITLE_SNIPPET_PATTERNS = [
  /\bAI receptionist\b/i,
  /\banswering service\b/i,
  /\bvirtual receptionist\b/i,
  /\btop \d+\b/i,
  /\bbest \d+\b/i,
  /\bhow to\b/i,
  /\bguide to\b/i,
  /\bwhat is\b/i,
  /\bindustry trends?\b/i,
  /\bmarket report\b/i,
  /\bsoftware\b/i,
  /\bSaaS\b/,
  /\bplatform\b/i,
  /\bblog\b/i,
  /\bnewsletter\b/i,
];

const DIRECTORY_DOMAINS: Record<string, string> = {
  "yelp.com": "Yelp listing",
  "bbb.org": "BBB listing",
  "angi.com": "Angi listing",
  "homeadvisor.com": "HomeAdvisor listing",
  "thumbtack.com": "Thumbtack listing",
  "yellowpages.com": "YellowPages listing",
  "mapquest.com": "MapQuest listing",
  "facebook.com": "Facebook business page",
  "manta.com": "Manta listing",
  "chamberofcommerce.com": "Chamber directory",
  "superpages.com": "SuperPages listing",
  "citysearch.com": "Citysearch listing",
  "nextdoor.com": "Nextdoor listing",
  "google.com": "Google listing",
  "g.page": "Google Business page",
};

const PHONE_PATTERN = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

function domainMatches(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function isDirectoryUrl(url: string): boolean {
  return Object.keys(DIRECTORY_DOMAINS).some((d) => domainMatches(url, d));
}

function classifySourceType(url: string): string {
  for (const [domain, label] of Object.entries(DIRECTORY_DOMAINS)) {
    if (domainMatches(url, domain)) return label;
  }
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (!host.includes("blog") && !host.includes("news")) {
      return "Official or business website";
    }
  } catch {
    /* ignore */
  }
  return "Web listing";
}

export function shouldRejectSearchResult(result: PerplexitySearchResult): boolean {
  if (isDirectoryUrl(result.url)) return false;

  if (REJECT_URL_PATTERNS.some((p) => p.test(result.url))) {
    return true;
  }

  const combined = `${result.title} ${result.snippet} ${result.url}`;
  if (REJECT_TITLE_SNIPPET_PATTERNS.some((p) => p.test(combined))) {
    return true;
  }

  return false;
}

function extractBusinessName(title: string, snippet: string): string {
  const cleaned = title
    .replace(/\s*[|\-–—]\s*Yelp.*$/i, "")
    .replace(/\s*[|\-–—]\s*BBB.*$/i, "")
    .replace(/\s*[|\-–—]\s*Angi.*$/i, "")
    .replace(/\s*[|\-–—]\s*Yellow Pages.*$/i, "")
    .replace(/\s*[|\-–—]\s*MapQuest.*$/i, "")
    .replace(/\s*[|\-–—]\s*Facebook.*$/i, "")
    .trim();

  const pipeSplit = cleaned.split(/\s*[|\-–—]\s*/)[0]?.trim();
  if (pipeSplit && pipeSplit.length > 2 && pipeSplit.length < 80) {
    return pipeSplit;
  }

  const snippetName = snippet.match(
    /^([A-Z][A-Za-z0-9\s&'.]{2,60}?)(?:\s+[-–—|]|\.|,)/,
  );
  if (snippetName?.[1]) return snippetName[1].trim();

  return cleaned.slice(0, 60) || "Unknown business";
}

function extractPhone(text: string): string | undefined {
  return text.match(PHONE_PATTERN)?.[0];
}

function extractWebsite(url: string, sourceType: string): string | undefined {
  if (sourceType === "Official or business website") {
    return url;
  }
  return undefined;
}

function determineVerification(
  businessName: string,
  location: string,
  phone: string | undefined,
  sourceType: string,
): VerificationStatus {
  const hasName =
    businessName.length > 2 && businessName !== "Unknown business";
  const hasLocation = location.length > 0;
  const isDirectory =
    sourceType !== "Official or business website" &&
    sourceType !== "Web listing";

  if (hasName && hasLocation && (phone || isDirectory)) {
    return "Verified";
  }
  if (hasName && (hasLocation || isDirectory)) {
    return "Partially verified";
  }
  return "Not verified";
}

export function extractEntityFromResult(
  result: PerplexitySearchResult,
  category: string,
  location: string,
): EntityCandidate {
  const sourceType = classifySourceType(result.url);
  const businessName = extractBusinessName(result.title, result.snippet);
  const phone = extractPhone(`${result.title} ${result.snippet}`);
  const website = extractWebsite(result.url, sourceType);
  const verification = determineVerification(
    businessName,
    location,
    phone,
    sourceType,
  );

  const missing: string[] = [];
  if (!phone) missing.push("phone");
  if (!website) missing.push("website");
  if (!location) missing.push("location");

  return {
    business_name: businessName,
    category,
    location,
    source_url: result.url,
    source_type: sourceType,
    website,
    phone,
    evidence_from_snippet: result.snippet.slice(0, 300) || result.title,
    verification_status: verification,
    missing_info: missing,
    query_used: result.queryUsed,
  };
}

export function validateAndExtractEntities(
  results: PerplexitySearchResult[],
  category: string,
  location: string,
): EntitySearchOutcome {
  let rejected = 0;
  const candidates: EntityCandidate[] = [];
  const seenNames = new Set<string>();

  for (const result of results) {
    if (shouldRejectSearchResult(result)) {
      rejected++;
      continue;
    }

    const entity = extractEntityFromResult(result, category, location);
    if (entity.verification_status === "Not verified") {
      rejected++;
      continue;
    }

    const key = entity.business_name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    candidates.push(entity);
  }

  const verified = candidates.filter(
    (c) =>
      c.verification_status === "Verified" ||
      c.verification_status === "Partially verified",
  );

  if (verified.length === 0) {
    const loc = location || "your area";
    const cat = category || "business";
    return {
      status: "not_found",
      candidates: [],
      reason: "No verified entity found from returned search results.",
      suggested_queries: [
        `Google Maps: ${cat} ${loc}`,
        `Yelp: ${cat} ${loc}`,
        `BBB: ${cat} ${loc}`,
        `YellowPages: ${cat} ${loc}`,
      ],
      rejected_count: rejected,
    };
  }

  return {
    status: "found",
    candidates: verified.slice(0, 5),
    rejected_count: rejected,
  };
}

export function formatEntitySearchReport(
  outcome: EntitySearchOutcome,
  rawResultCount: number,
  queryCount: number,
): string {
  const lines: string[] = [
    "## Research Mode: entity_search",
    "## Provider: Perplexity Search API",
    "",
    `Search queries executed: ${queryCount}`,
    `Raw results retrieved: ${rawResultCount}`,
    `Rejected (non-entity or unverified): ${outcome.rejected_count}`,
    "",
  ];

  if (outcome.status === "not_found") {
    lines.push("**Status:** not_found");
    lines.push(`**Reason:** ${outcome.reason}`);
    lines.push("");
    lines.push("**Suggested manual verification queries:**");
    for (const q of outcome.suggested_queries ?? []) {
      lines.push(`- ${q}`);
    }
    lines.push("");
    lines.push(
      "Do not cite general AI receptionist or industry articles as proof of a specific local business.",
    );
    return lines.join("\n");
  }

  lines.push("**Status:** found");
  lines.push("");
  outcome.candidates.forEach((c, i) => {
    lines.push(`### Entity ${i + 1}`);
    lines.push(`- **Business name:** ${c.business_name}`);
    lines.push(`- **Category:** ${c.category}`);
    lines.push(`- **Location:** ${c.location}`);
    lines.push(`- **Source URL:** ${c.source_url}`);
    lines.push(`- **Source type:** ${c.source_type}`);
    if (c.website) lines.push(`- **Website:** ${c.website}`);
    if (c.phone) lines.push(`- **Phone:** ${c.phone}`);
    lines.push(`- **Evidence from source:** ${c.evidence_from_snippet}`);
    lines.push(`- **Verification status:** ${c.verification_status}`);
    lines.push(
      `- **Notes on missing information:** ${c.missing_info.length ? c.missing_info.join(", ") : "none"}`,
    );
    lines.push(`- **Query used:** ${c.query_used}`);
    lines.push("");
  });

  lines.push(
    "IMPORTANT: Final output includes ONLY entities from Perplexity Search API results above. No invented entities.",
  );
  return lines.join("\n");
}

export function generateEntitySearchQueries(prompt: string): string[] {
  const location = extractLocation(prompt);
  const category = extractCategory(prompt);
  const loc = location ?? "";
  const cat = category ?? "business";

  const queries: string[] = [];

  if (loc && cat) {
    queries.push(`${cat} ${loc} official website`);
    queries.push(`${loc} ${cat} company phone`);
    queries.push(`${loc} ${cat} contact`);
    queries.push(`${loc} ${cat} contractor website`);
    queries.push(`site:yelp.com ${loc} ${cat}`);
  } else if (loc) {
    queries.push(`${loc} local business official website`);
    queries.push(`${loc} company phone contact`);
    queries.push(`site:yelp.com ${loc}`);
    queries.push(`site:bbb.org ${loc}`);
  } else if (cat) {
    queries.push(`${cat} official website contact`);
    queries.push(`${cat} company phone`);
    queries.push(`site:yelp.com ${cat}`);
  } else {
    const excerpt = prompt.slice(0, 80);
    queries.push(`${excerpt} official website`);
    queries.push(`${excerpt} contact phone`);
    queries.push(`${excerpt} business listing`);
  }

  return [...new Set(queries.map((q) => q.trim()))].slice(0, 5);
}

function extractLocation(prompt: string): string | null {
  const cityState = prompt.match(
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*,\s*[A-Z]{2})\b/,
  );
  if (cityState) return cityState[1];

  const near = prompt.match(
    /\b(?:in|near|around)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*(?:,\s*[A-Z]{2})?)/i,
  );
  if (near) return near[1];

  return null;
}

function extractCategory(prompt: string): string | null {
  const trades: Record<string, string> = {
    plumber: "plumber",
    plumbers: "plumber",
    plumbing: "plumbing contractor",
    hvac: "HVAC",
    electrician: "electrician",
    "auto repair": "auto repair",
    "pest control": "pest control",
    "appliance repair": "appliance repair",
    contractor: "contractor",
    roofing: "roofing",
    landscap: "landscaping",
  };

  const lower = prompt.toLowerCase();
  for (const [key, label] of Object.entries(trades)) {
    if (lower.includes(key)) return label;
  }

  const businessMatch = prompt.match(
    /\b(?:find|search for|locate)\s+(?:one|a|an)?\s*([a-z][a-z\s]{2,30}?)(?:\s+in|\s+near|\s+with|$)/i,
  );
  if (businessMatch?.[1]) {
    return businessMatch[1].trim();
  }

  return null;
}
