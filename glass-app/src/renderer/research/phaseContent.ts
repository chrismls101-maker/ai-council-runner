/**
 * Aletheia Research Explorer -- Phase Content
 * All scripted content for all 5 phases.
 * Each phase exports an async function that receives column push handles
 * and drives the torrent display via await sequencing.
 */

export type LineType = 'normal' | 'dim' | 'hit' | 'signal' | 'warn' | 'blank';

export interface PushFn {
  (text: string, type?: LineType): void;
}

export interface PhaseHandles {
  left: PushFn;
  mid: PushFn;
  right: PushFn;
  clearAll: () => void;
  setStatus: (text: string) => void;
  setZones: (l: string, m: string, r: string) => void;
  setChip: (text: string) => void;
  wait: (ms: number) => Promise<void>;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const w = (handles: PhaseHandles, ms: number) => handles.wait(ms + rnd(-40, 40));

// ---------------------------------------------
// PHASE 1 -- Search / Source Discovery
// ---------------------------------------------
export async function runPhase1(h: PhaseHandles): Promise<void> {
  const { left: L, mid: M, right: R } = h;
  h.setChip('Aletheia - Searching');
  h.setStatus('Phase 1  --  Search');
  h.setZones('Scraping', 'Analysis', 'Output');

  // Query decomposition
  L('decomposing query...');
  await w(h, 400);
  L('intent: income generation strategy');
  await w(h, 300);
  L('sub-questions: 8 identified');
  await w(h, 300);
  L('');

  M('sub-question graph:');
  await w(h, 300);
  M('  [1] what approaches exist?');
  await w(h, 200);
  M('  [2] what pricing models work?');
  await w(h, 200);
  M('  [3] what niches convert best?');
  await w(h, 200);
  M('  [4] offer-first or distrib-first?');
  await w(h, 200);
  M('  [5] realistic timelines?');
  await w(h, 300);
  M('  priority scoring: complete', 'signal');

  R('query strategy:');
  await w(h, 400);
  R('  formulations: 10 variants');
  await w(h, 300);
  R('  negation queries: 3 added');
  await w(h, 300);
  R('  domain-specific: 4 added');

  // Source 1
  await w(h, 500);
  L('');
  L('--- query 1 of 10 ---');
  await w(h, 200);
  L('search "claude api income strategies"');
  await w(h, 300);
  L('GET reddit.com/r/SideProject ...');
  await w(h, 340);
  L('200 OK   reddit.com   312ms', 'hit');
  await w(h, 70);
  L('"making $14k/mo selling Claude workflows"', 'hit');
  await w(h, 150);
  L('GET indiehackers.com/ai-income ...');
  await w(h, 280);
  L('200 OK   indiehackers   289ms', 'hit');
  await w(h, 80);
  L('"failed 6mo selling AI. succeeded', 'hit');
  await w(h, 120);
  L(' month 7 when I stopped pitching AI"', 'hit');

  M('');
  M('source tier: CORE (full read)');
  await w(h, 300);
  M('credibility: reddit 0.70 / IH 0.82');
  await w(h, 300);
  M('cross-citation: 3 refs found');
  await w(h, 300);
  M('date freshness: 2024-25 [ok]', 'signal');

  R('');
  R('pattern: outcome > tool', 'signal');
  await w(h, 300);
  R('  appearing in: source 1, 2');
  await w(h, 300);
  R('  strength: building...');

  // Source 2
  await w(h, 400);
  L('');
  L('--- query 2 of 10 ---');
  await w(h, 200);
  L('search "claude $10k freelance niche"');
  await w(h, 320);
  L('GET news.ycombinator.com ...');
  await w(h, 380);
  L('200 OK   HN   201ms', 'hit');
  await w(h, 80);
  L('"Show HN: $11k/mo with one Claude', 'hit');
  await w(h, 100);
  L(' wrapper. here is exactly how."', 'hit');
  await w(h, 200);
  L('GET twitter.com/ai_builder ...');
  await w(h, 260);
  L('200 OK   twitter   178ms', 'hit');
  await w(h, 70);
  L('"stopped building, started talking', 'hit');
  await w(h, 100);
  L(' to 10 people. had 2 clients before', 'hit');
  await w(h, 100);
  L(' I finished building."', 'hit');

  M('');
  M('source tier: CORE (HN) + SUPPORT');
  await w(h, 300);
  M('credibility: HN 0.85 / twitter 0.70');
  await w(h, 300);
  M('CONFLICT DETECTED:', 'warn');
  await w(h, 200);
  M('  offer-first vs distrib-first', 'warn');
  await w(h, 300);
  M('  routing to resolution queue');

  R('');
  R('CONFLICT: sequencing order', 'warn');
  await w(h, 300);
  R('  A: build offer -> find clients');
  await w(h, 250);
  R('  B: find clients -> build offer');
  await w(h, 250);
  R('  holding... need more sources');

  // Source 3
  await w(h, 400);
  L('');
  L('--- query 3 of 10 ---');
  await w(h, 200);
  L('search "ai consulting retainer model"');
  await w(h, 310);
  L('GET forbes.com/ai-business ...');
  await w(h, 420);
  L('200 OK   forbes.com   445ms', 'hit');
  await w(h, 80);
  L('"AI consulting market saturated at', 'hit');
  await w(h, 100);
  L(' generic level. unsaturated at niche."', 'hit');
  await w(h, 180);
  L('GET substack.com/p/ai-income ...');
  await w(h, 290);
  L('200 OK   substack   223ms', 'hit');
  await w(h, 70);
  L('"charge for outcomes, not effort."', 'hit');

  M('');
  M('credibility: forbes 0.90 / sub 0.78');
  await w(h, 300);
  M('macro trend: niche = less competition', 'signal');
  await w(h, 300);
  M('claim: outcome pricing confirmed x3');

  R('');
  R('pattern: niche specificity', 'signal');
  await w(h, 300);
  R('  supporting: forbes + IH + reddit');
  await w(h, 250);
  R('  confidence: MODERATE -> HIGH');

  // Queries 4-7
  await w(h, 500);
  L('');
  L('--- query 4 of 10 ---');
  await w(h, 200);
  L('search "claude workflow pricing 2025"');
  await w(h, 330);
  L('200 OK   producthunt.com   198ms', 'hit');
  await w(h, 100);
  L('200 OK   medium.com   244ms', 'hit');
  await w(h, 100);
  L('200 OK   beehiiv.com   189ms', 'hit');
  await w(h, 200);
  L('"$2k-$4k/mo retainer is the sweet spot"', 'hit');

  await w(h, 400);
  L('');
  L('--- query 5 of 10 ---');
  await w(h, 200);
  L('search "failure modes ai income generation"');
  await w(h, 360);
  L('200 OK   reddit.com   312ms', 'hit');
  await w(h, 100);
  L('200 OK   linkedin.com   401ms', 'hit');
  await w(h, 120);
  L('"spent 3 months building. zero clients."', 'hit');
  await w(h, 100);
  L('"built first, searched second: mistake"', 'hit');

  M('');
  M('failure mode confirmed:', 'warn');
  await w(h, 250);
  M('  building before validating = 0 clients');
  await w(h, 250);
  M('  supports: distrib-first hypothesis');

  R('');
  R('conflict update:', 'warn');
  await w(h, 300);
  R('  B sources avg date: 2024-25');
  await w(h, 250);
  R('  A sources avg date: 2022-23');
  await w(h, 250);
  R('  time-bound resolution possible');

  await w(h, 400);
  L('');
  L('--- query 6-10 (parallel) ---');
  await w(h, 200);
  L('batch: 5 queries running...');
  await w(h, 600);
  L('200 OK   shopify.com/blog   287ms', 'hit');
  await w(h, 100);
  L('200 OK   growthhackers.com   312ms', 'hit');
  await w(h, 100);
  L('200 OK   techcrunch.com   445ms', 'hit');
  await w(h, 100);
  L('200 OK   ahrefs.com   198ms', 'hit');
  await w(h, 100);
  L('200 OK   nocode.tech   223ms', 'hit');

  M('');
  M('coverage map:');
  await w(h, 300);
  M('  [1] approaches:    ANSWERED', 'signal');
  await w(h, 200);
  M('  [2] pricing:       ANSWERED', 'signal');
  await w(h, 200);
  M('  [3] niche:         ANSWERED', 'signal');
  await w(h, 200);
  M('  [4] sequencing:    CONFLICTED', 'warn');
  await w(h, 200);
  M('  [5] timeline:      PARTIAL', 'warn');
  await w(h, 300);
  M('  28 sources indexed');

  R('');
  R('phase 1 summary:');
  await w(h, 300);
  R('  28 sources indexed');
  await w(h, 200);
  R('  5 core sources flagged');
  await w(h, 200);
  R('  1 active contradiction');
  await w(h, 200);
  R('  passing to Phase 2...', 'signal');
}

// ---------------------------------------------
// PHASE 2 -- Read & Reason
// ---------------------------------------------
export async function runPhase2(h: PhaseHandles): Promise<void> {
  const { left: L, mid: M, right: R } = h;
  h.setChip('Aletheia - Reading');
  h.setStatus('Phase 2  --  Read & Reason');
  h.setZones('Reading', 'Extracting', 'Reasoning');

  L('--- reading top 6 sources ---');
  await w(h, 400);

  // Source 1
  L('');
  L('source 1 of 6: reddit.com/r/SideProject');
  await w(h, 600);
  L('"started with one Claude workflow');
  await w(h, 450);
  L(' for content repurposing. $1,500/mo.');
  await w(h, 450);
  L(' 3hrs of my time per month."');
  await w(h, 450);
  L('"I never mentioned AI once. client');
  await w(h, 450);
  L(' thinks I have a team."');

  M('reading source 1...');
  await w(h, 500);
  M('claim: done-for-you > selling tool', 'signal');
  await w(h, 350);
  M('  type: PRIMARY (first-person)');
  await w(h, 300);
  M('  tag: SUPPORTED (1 source)');
  await w(h, 300);
  M('claim: outcome hides tool used', 'signal');
  await w(h, 300);
  M('  implication: price on result only');

  await w(h, 500);
  // Source 2
  L('');
  L('source 2 of 6: indiehackers.com');
  await w(h, 600);
  L('"failed for 6 months selling AI.');
  await w(h, 450);
  L(' succeeded month 7 when I stopped');
  await w(h, 450);
  L(' pitching AI and started pitching');
  await w(h, 450);
  L(' a specific outcome to one niche."');
  await w(h, 500);
  L('"close rate: 8% -> 41% after niche"');

  M('');
  M('claim: niche = close rate 5x', 'signal');
  await w(h, 350);
  M('  type: PRIMARY (before/after)');
  await w(h, 300);
  M('  tag: SUPPORTED (n=1, strong)');
  await w(h, 300);
  M('  NOTE: single source for stat');

  R('--- reasoning ---');
  await w(h, 600);
  R('pattern convergence:', 'signal');
  await w(h, 350);
  R('  tool is never the product');
  await w(h, 350);
  R('  outcome is always the product');

  await w(h, 500);
  // Source 3
  L('');
  L('source 3 of 6: news.ycombinator.com');
  await w(h, 600);
  L('"$3k/mo retainer x 4 clients = $12k.');
  await w(h, 450);
  L(' client never touches the AI. ever."');
  await w(h, 450);
  L('"hourly caps income. retainer uncaps."');

  M('');
  M('claim: retainer scales cleanly', 'signal');
  await w(h, 350);
  M('  $3k x 4 = $12k MRR confirmed');
  await w(h, 300);
  M('claim: hourly = income ceiling', 'signal');
  await w(h, 300);
  M('  tag: VERIFIED (multiple sources)');

  R('');
  R('connecting: done-for-you + retainer', 'signal');
  await w(h, 350);
  R('  both remove the time ceiling');
  await w(h, 350);
  R('  both abstract tool from client');
  await w(h, 350);
  R('  these are the same insight');

  await w(h, 500);
  // Source 4: Contradiction
  L('');
  L('source 4 of 6: twitter.com/ai_builder');
  await w(h, 600);
  L('"spent 3 months building. zero clients.');
  await w(h, 450);
  L(' month 4: talked to 10 people first.');
  await w(h, 450);
  L(' had 2 clients before finishing build."');

  M('');
  M('CONTRADICTION resurfaces:', 'warn');
  await w(h, 350);
  M('  source 4: distrib-first (2024)', 'warn');
  await w(h, 300);
  M('  sources 1-3: offer-first (2022-23)', 'warn');

  R('');
  R('working contradiction...', 'warn');
  await w(h, 500);
  R('  A: offer-first: 8 sources, ~2023');
  await w(h, 350);
  R('  B: distrib-first: 5 sources, ~2025');
  await w(h, 350);
  R('  market matured -> B is current');
  await w(h, 400);
  R('  RESOLVED: time-bounded to 2025', 'signal');

  await w(h, 500);
  // Sources 5-6
  L('');
  L('source 5 of 6: forbes.com/ai-business');
  await w(h, 600);
  L('"winners are not more technical.');
  await w(h, 450);
  L(' winners picked a smaller pond."');

  M('');
  M('macro corroboration: niche = moat', 'signal');
  await w(h, 350);
  M('  tag: VERIFIED (Forbes + IH + reddit)');

  await w(h, 500);
  L('');
  L('source 6 of 6: substack.com/p/ai-income');
  await w(h, 600);
  L('"find pain -> wrap Claude -> deliver.');
  await w(h, 450);
  L(' that is the whole playbook."');

  M('');
  M('thesis confirmed across all 6', 'signal');
  await w(h, 300);
  M('  charge for outcome, not effort');
  await w(h, 300);
  M('  extraction complete');

  R('');
  R('core thesis assembled:', 'signal');
  await w(h, 400);
  R('  1. pick niche + pain (distrib first)');
  await w(h, 300);
  R('  2. wrap Claude around it');
  await w(h, 300);
  R('  3. charge for outcome');
  await w(h, 300);
  R('  4. done-for-you retainer');
  await w(h, 400);
  R('  passing to Phase 3...', 'signal');
}

// ---------------------------------------------
// PHASE 3 -- Draft
// ---------------------------------------------
export async function runPhase3(h: PhaseHandles): Promise<void> {
  const { left: L, mid: M, right: R } = h;
  h.setChip('Aletheia - Writing');
  h.setStatus('Phase 3  --  Drafting');
  h.setZones('Writing', 'Structure', 'Review');

  M('--- outline locking ---');
  await w(h, 400);
  M('  1. the reframe');
  await w(h, 180);
  M('  2. find clients first');
  await w(h, 180);
  M('  3. niche specificity');
  await w(h, 180);
  M('  4. wrap Claude around pain');
  await w(h, 180);
  M('  5. price the outcome');
  await w(h, 180);
  M('  6. retainer model');
  await w(h, 180);
  M('  7. honest timeline');
  await w(h, 300);
  M('  tone: direct, no hype', 'signal');

  R('--- review queue ---');
  await w(h, 300);
  R('  [ ] unsupported claims');
  await w(h, 200);
  R('  [ ] niche specifics present');
  await w(h, 200);
  R('  [ ] contradiction addressed');
  await w(h, 200);
  R('  [ ] actionable first step');
  await w(h, 200);
  R('  [ ] realistic timeline');

  // Section 1
  await w(h, 500);
  L('--- section 1: the reframe ---');
  await w(h, 400);
  L('"the wrong question is: how do I');
  await w(h, 450);
  L(' make money with Claude? The right');
  await w(h, 450);
  L(' question: what does someone need');
  await w(h, 450);
  L(' done that Claude finishes in 10min');
  await w(h, 450);
  L(' but takes them 10 hours?"');

  M('');
  M('[1] reframe -- drafted', 'signal');
  await w(h, 300);
  M('    158 words');

  R('');
  R('[1] review: PASS', 'signal');
  await w(h, 250);
  R('  no unsupported claims');
  await w(h, 250);
  R('  reframe clear, no hype');

  // Section 2-4 (faster)
  await w(h, 600);
  L('');
  L('--- section 2: distrib-first ---');
  await w(h, 400);
  L('"talk to 10 people in your niche');
  await w(h, 450);
  L(' before writing a single prompt.');
  await w(h, 450);
  L(' ask: what takes you most time?');
  await w(h, 450);
  L(' one answer will repeat. build that."');

  M('');
  M('[2] distrib-first -- drafted', 'signal');
  await w(h, 250);
  M('    191 words');

  await w(h, 600);
  L('');
  L('--- section 3: niche ---');
  await w(h, 400);
  L('"not e-commerce. not coaches. try:');
  await w(h, 450);
  L(' shopify stores $200k-$1M selling');
  await w(h, 450);
  L(' physical products who hate writing');
  await w(h, 450);
  L(' product descriptions."');

  M('');
  M('[3] niche -- drafted', 'signal');
  await w(h, 250);
  M('    204 words');
  R('');
  R('FLAG: needs close-rate data', 'warn');
  await w(h, 300);
  R('  -> adding 8% -> 41% stat...');
  await w(h, 400);
  R('  resolved', 'signal');

  await w(h, 600);
  L('');
  L('--- sections 4-7 (drafting) ---');
  await w(h, 500);
  L('price the outcome, not your time...');
  await w(h, 400);
  L('retainer: 5x$2,500 = $12,500 floor...');
  await w(h, 400);
  L('fast path: month 3. median: month 5...');
  await w(h, 400);
  L('draft complete.');

  M('');
  M('all 7 sections complete', 'signal');
  await w(h, 250);
  M('  ~1,213 words');
  await w(h, 250);
  M('  passing to verify...');

  R('');
  R('draft approved', 'signal');
  await w(h, 300);
  R('  6 claims to verify');
  await w(h, 300);
  R('  passing to Phase 4...', 'signal');
}

// ---------------------------------------------
// PHASE 4 -- Verify
// ---------------------------------------------
export async function runPhase4(h: PhaseHandles): Promise<void> {
  const { left: L, mid: M, right: R } = h;
  h.setChip('Aletheia - Verifying');
  h.setStatus('Phase 4  --  Verification');
  h.setZones('Claims', 'Sources', 'Verdict');

  M('loading source index...');
  await w(h, 500);
  M('  28 sources indexed (Phase 1)');
  await w(h, 250);
  M('   6 sources deep-read (Phase 2)');
  await w(h, 250);
  M('  ready to cross-reference');

  R('--- verification ---');
  await w(h, 400);
  R('checking 6 claims...');

  // Claim 1
  await w(h, 600);
  L('--- extracting claims ---');
  await w(h, 300);
  L('');
  L('claim 1: outcome > tool');
  await w(h, 300);
  L('"the outcome is the product"');

  M('');
  M('cross-ref claim 1...');
  await w(h, 350);
  M('  reddit:        confirmed');
  await w(h, 250);
  M('  indiehackers:  confirmed');
  await w(h, 250);
  M('  substack:      confirmed');
  await w(h, 250);
  M('  6 of 6 sources agree');

  R('');
  R('claim 1: PASS', 'signal');
  await w(h, 250);
  R('  confidence: HIGH (97%)', 'signal');

  // Claim 2
  await w(h, 600);
  L('');
  L('claim 2: niche close rate 8->41%');

  M('');
  M('cross-ref claim 2...');
  await w(h, 350);
  M('  source: indiehackers only');
  await w(h, 250);
  M('  type: first-person, n=1');
  await w(h, 250);
  M('  corroborated trend: yes');
  await w(h, 250);
  M('  exact stat: single source');

  R('');
  R('claim 2: FLAG', 'warn');
  await w(h, 250);
  R('  exact stat = single source', 'warn');
  await w(h, 300);
  R('  -> softening language...');
  await w(h, 350);
  R('  "one founder reported 8->41%"');
  await w(h, 250);
  R('  updated -- PASS', 'signal');

  // Claims 3-6 faster
  await w(h, 500);
  L('');
  L('claim 3: retainer $2.5k x 4 = $10k');
  M('');
  M('cross-ref claim 3...');
  await w(h, 300);
  M('  math: 2500 x 4 = 10000 [ok]');
  await w(h, 250);
  M('  HN case: $3k x 4 = $12k (ref)');
  R('');
  R('claim 3: PASS', 'signal');
  await w(h, 250);
  R('  confidence: HIGH (91%)', 'signal');

  await w(h, 500);
  L('');
  L('claim 4: distrib-first correct 2025');
  M('');
  M('cross-ref claim 4...');
  await w(h, 300);
  M('  A sources (offer-first): 8, ~2023');
  await w(h, 250);
  M('  B sources (distrib-first): 5, ~2025');
  R('');
  R('claim 4: PASS (time-bounded)', 'signal');
  await w(h, 250);
  R('  confidence: MODERATE (82%)', 'signal');

  await w(h, 500);
  L('');
  L('claim 5: $10k by month 3');
  M('');
  M('cross-ref claim 5...');
  await w(h, 300);
  M('  fastest confirmed: month 1 (HN)');
  await w(h, 250);
  M('  median confirmed: month 4-5');
  R('');
  R('claim 5: FLAG', 'warn');
  await w(h, 250);
  R('  month 3 = optimistic case', 'warn');
  await w(h, 300);
  R('  -> "fast: 3mo. median: 4-6mo"');
  await w(h, 250);
  R('  updated -- PASS', 'signal');

  await w(h, 500);
  L('');
  L('claim 6: price $1,800-$3,500/mo');
  M('');
  M('cross-ref claim 6...');
  await w(h, 300);
  M('  HN: $3k/mo confirmed');
  await w(h, 250);
  M('  reddit: $1.5k confirmed');
  await w(h, 250);
  M('  range supported: yes');
  R('');
  R('claim 6: PASS', 'signal');
  await w(h, 250);
  R('  confidence: HIGH (89%)', 'signal');

  // Final verdict
  await w(h, 600);
  L('');
  L('all 6 claims verified');

  M('');
  M('--- summary ---');
  await w(h, 300);
  M('passed clean:    4', 'signal');
  await w(h, 200);
  M('flagged + fixed: 2', 'warn');
  await w(h, 200);
  M('failed:          0', 'signal');

  R('');
  R('--- final verdict ---');
  await w(h, 400);
  R('overall confidence: 91%', 'signal');
  await w(h, 300);
  R('factual integrity:  strong', 'signal');
  await w(h, 300);
  R('hype language:      none', 'signal');
  await w(h, 400);
  R('');
  R('RELEASE: approved', 'signal');
  await w(h, 300);
  R('passing to Phase 5...', 'signal');
}

// ---------------------------------------------
// PHASE 5 data -- structured delivery content
// (Rendered by Phase5Deliver component, not torrent)
// ---------------------------------------------
export const phase5Data = {
  question: 'How to use Claude to create $10k/month income',
  questionShort: 'Claude to $10k/month income',

  keyJudgments: [
    {
      id: 1,
      likelihood: 'highly likely',
      confidence: 'HIGH',
      claim: 'Positioning the outcome rather than the tool is the primary success factor across all income paths.',
      sources: 6,
      tag: 'VERIFIED' as const,
    },
    {
      id: 2,
      likelihood: 'likely',
      confidence: 'HIGH',
      claim: 'Retainer-based pricing ($1,800-$3,500/month) outperforms project pricing for sustained income above $8k/month.',
      sources: 4,
      tag: 'VERIFIED' as const,
    },
    {
      id: 3,
      likelihood: 'likely',
      confidence: 'MODERATE',
      claim: 'Niche specificity increases close rates by 3-5x versus generic positioning in the current market.',
      sources: 2,
      tag: 'SUPPORTED' as const,
    },
    {
      id: 4,
      likelihood: 'probable',
      confidence: 'MODERATE',
      claim: 'Distribution-first sequencing -- finding clients before building -- is optimal for 2025 market conditions.',
      sources: 3,
      tag: 'CONTESTED' as const,
    },
    {
      id: 5,
      likelihood: 'possible',
      confidence: 'LOW',
      claim: '$10k/month is achievable by month 3 on the fast path; the median path runs 4-6 months.',
      sources: 2,
      tag: 'INFERRED' as const,
    },
  ],

  options: [
    {
      id: 'A',
      name: 'Done-for-You Content Agency',
      description: 'Wrap Claude in a fully-delivered content service for one specific niche. Client never touches the AI.',
      timeline: '3-5 months',
      risk: 'Low',
      confidence: 'High',
      recommended: true,
      why: 'Most confirmed by evidence, lowest build time, retainer model natural fit.',
      reverseIf: 'Niche market is too small to sustain 4+ clients.',
    },
    {
      id: 'B',
      name: 'AI Workflow Productization',
      description: 'Build a Claude-powered workflow and sell access or a monthly subscription.',
      timeline: '6-12 months',
      risk: 'Medium',
      confidence: 'Medium',
      recommended: false,
      why: 'Higher ceiling but longer runway required. Distribution challenge is harder.',
      reverseIf: 'Becomes recommended if audience already exists before building.',
    },
    {
      id: 'C',
      name: 'Implementation Consulting',
      description: 'Advise businesses on Claude integration. Charge for strategy and setup, then transition to retainer support.',
      timeline: '4-8 months',
      risk: 'Low-Medium',
      confidence: 'Medium',
      recommended: false,
      why: 'Strong for existing professional network. Harder to scale beyond 5-6 clients without hiring.',
      reverseIf: 'Becomes recommended if existing professional reputation in a target industry.',
    },
  ],

  contradictions: [
    {
      claim1: { source: '8 sources (2022-23)', text: '"Build the offer first, then find clients"' },
      claim2: { source: '5 sources (2024-25)', text: '"Find clients first, then build the offer"' },
      type: 'Temporal + methodological',
      resolution: 'Time-bounded: distribution-first recommended for 2025 market conditions. Offer-first may apply in less competitive niches.',
    },
  ],

  auditTrail: {
    sourcesScanned: 28,
    sourcesDeepRead: 6,
    claimsVerified: 6,
    claimsSoftened: 2,
    contradictionsResolved: 1,
    confidence: 91,
    phases: 4,
  },
};
