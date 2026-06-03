export type ResearchMode =
  | "entity_search"
  | "concept_research"
  | "competitor_research"
  | "evidence_validation"
  | "technical_research";

const ENTITY_SEARCH_PATTERN =
  /\b(prospects?|business(?:es)?|companies?|company|people|person|investors?|local\s+services?|contact\s+info|phone\s+numbers?|websites?|verified\s+entity|source\s+url|find\s+(?:one|ten|\d+)|who\s+should\s+i\s+contact|near\s+me)\b/i;

const ENTITY_TRADE_PATTERN =
  /\b(plumber|plumbers|plumbing|hvac|electrician|auto\s*repair|pest\s*control|appliance\s*repair|contractor|roofing|landscap)\b/i;

const LOCATION_PATTERN =
  /\b(?:in|near|around)\s+[A-Za-z]+(?:\s+[A-Za-z]+)*(?:,\s*[A-Z]{2})?\b|\b[A-Z][a-zA-Z]+,\s*[A-Z]{2}\b/i;

const EVIDENCE_PATTERN =
  /\b(verify|validated?|validation|evidence|source-backed|cite\s+sources?|fact-check)\b/i;

export function isEntitySearchIntent(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;

  if (
    /\b(competitors?|competitive intelligence|market trend|market size|industry evidence)\b/i.test(
      text,
    ) &&
    !/\b(find\s+(?:one|ten|\d+)|verified|source\s+url|phone\s+number)\b/i.test(text)
  ) {
    return false;
  }

  if (ENTITY_SEARCH_PATTERN.test(text)) return true;
  if (ENTITY_TRADE_PATTERN.test(text) && LOCATION_PATTERN.test(text)) return true;
  if (/\b(?:in|near)\s+[A-Za-z]/i.test(text) && ENTITY_TRADE_PATTERN.test(text)) {
    return true;
  }
  return false;
}

export function detectResearchMode(
  prompt: string,
  workflowId?: string,
): ResearchMode {
  if (isEntitySearchIntent(prompt)) {
    return "entity_search";
  }
  if (workflowId === "competitive-intelligence") {
    return "competitor_research";
  }
  if (workflowId === "technical-audit") {
    return "technical_research";
  }
  if (EVIDENCE_PATTERN.test(prompt)) {
    return "evidence_validation";
  }
  if (workflowId === "market-research") {
    return "concept_research";
  }
  return "concept_research";
}

/** @deprecated Use detectResearchMode === "entity_search" */
export function isLocalProspectingIntent(prompt: string): boolean {
  return isEntitySearchIntent(prompt);
}

export const ENTITY_SEARCH_FINAL_JUDGE_APPEND = `

ENTITY SEARCH RESULTS (Research Scout used Perplexity Search API):

- Only recommend contacting entities marked **Verified** or **Partially verified**.
- If Research status is **not_found**, state clearly that no actionable verified entity was found.
- Do NOT write business-specific outreach for unverified or not_found entities.
- First action when not_found: run manual verification (Google Maps, Yelp, BBB, YellowPages) before outreach.
- Do not treat Search API industry articles or vendor pages as confirmed local business entities.`;

export const ENTITY_SEARCH_SALES_WRITER_APPEND = `

ENTITY SEARCH RULES (Research Scout output applies):

- If Research reported **not_found** or no Verified/Partially verified entity, write GENERIC category-level outreach templates only.
- State explicitly that a specific business must be verified before sending personalized outreach.
- Do not invent a business name, owner, phone, or website not present in Research Scout verified entities.`;

export const ENTITY_SEARCH_RESEARCH_USER_TASK =
  "Entity search complete. Use ONLY entities returned from Perplexity Search API results above. Do not add entities not in search results.";
