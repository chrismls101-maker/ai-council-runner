/**
 * Glass QA — risk heuristics for auto-enabling QA Mode on risky diffs.
 */

const RISK_PATH_PATTERNS: RegExp[] = [
  /\/auth\//i,
  /\/authentication\//i,
  /\/login\//i,
  /\/payment/i,
  /\/billing/i,
  /\/stripe/i,
  /\/migration/i,
  /\/migrations\//i,
  /prisma\/schema/i,
  /\/secrets?\//i,
  /\.env(\.|$)/i,
];

export function detectRiskyChangedPaths(paths: string[]): string[] {
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const p = raw.trim().replace(/\\/g, "/");
    if (!p || seen.has(p)) continue;
    if (RISK_PATH_PATTERNS.some((re) => re.test(p))) {
      seen.add(p);
      hits.push(p);
    }
  }
  return hits;
}

export function shouldAutoEnableQaForChanges(
  changedPaths: string[],
  qaModeEnabled: boolean,
): { enable: boolean; riskyPaths: string[] } {
  if (qaModeEnabled) return { enable: false, riskyPaths: [] };
  const riskyPaths = detectRiskyChangedPaths(changedPaths);
  return { enable: riskyPaths.length > 0, riskyPaths };
}
