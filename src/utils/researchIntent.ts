const ENTITY_SEARCH_PATTERN =
  /\b(prospects?|business(?:es)?|companies?|company|people|person|investors?|local\s+services?|contact\s+info|phone\s+numbers?|websites?|verified\s+entity|find\s+(?:one|ten|\d+)|who\s+should\s+i\s+contact|near\s+me)\b/i;

const ENTITY_TRADE_PATTERN =
  /\b(plumber|plumbers|plumbing|hvac|electrician|auto\s*repair|pest\s*control|appliance\s*repair|contractor|roofing|landscap)\b/i;

const LOCATION_PATTERN =
  /\b(?:in|near|around)\s+[A-Za-z]+(?:\s+[A-Za-z]+)*(?:,\s*[A-Z]{2})?\b|\b[A-Z][a-zA-Z]+,\s*[A-Z]{2}\b/i;

/** Client-side mirror of server entity search intent (UI labels only). */
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
