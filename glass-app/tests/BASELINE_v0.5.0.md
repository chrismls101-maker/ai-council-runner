# IIVO Glass — Baseline v0.5.0 (updated: QA HTTP bridge + full automation)

**Date:** 2026-06-12  
**Branch:** main  
**Typecheck:** ✅ clean  
**Tests:** 1,394 passing / 0 failing  
**New since PAT UI baseline:** Security fixes + dev-only IPC backdoors + data-testid coverage + 3 new QA scripts + 2 new Playwright E2E specs + 5 new npm scripts + **HTTP QA bridge** (Task #129–#130)

---

## Health snapshot

| Metric | Value |
|--------|-------|
| Total tests | **1,394** |
| Passing | **1,394** |
| Failing | **0** |
| TypeScript errors | **0** |
| Test suites | 65 |

---

## What shipped in this update — Agent API Interception Layer (Tasks #91–#99)

Wingman can now intercept and summarise AI agent API calls in real time. When enabled, Glass runs a local HTTP proxy on `127.0.0.1:7421`. The user points their coding tool (Claude Code, Cursor, etc.) at it via `ANTHROPIC_BASE_URL`. Glass forwards all traffic to the real Anthropic API with zero latency, capturing only a privacy-minimised snippet of each call.

### Privacy contract (enforced in code, not just documented)

| What Glass captures | What Glass NEVER captures |
|---------------------|--------------------------|
| Model name | Full API key (extracted for forwarding, immediately discarded) |
| System prompt ≤200 chars | Full system prompt |
| Last user message ≤300 chars | Full message history |
| Response text ≤300 chars | Full response |
| Tool names (e.g. `read_file`) | Tool call inputs / outputs (may contain file contents, secrets) |
| Token counts | Any data off-device |

| Task | File | What it does |
|------|------|--------------|
| #91 | `src/shared/agentProxy.ts` | Pure module — types, `sanitizeHeaders`, `extractRequestSnippets`, `extractResponseSnippets`, `extractStreamingSnippets`, `buildAgentCallSummary`, `analyzeAgentScope`, `formatCallsForPrompt`, `shortModelName`, `formatCallTime` |
| #92 | `src/main/agentProxyServer.ts` | `AgentProxyServer` class — binds `127.0.0.1` only, handles buffered + SSE streaming responses, `findAvailablePort` (7421–7425), `onCall` callback |
| #93 | `src/renderer/panel/AgentProxyConsentModal.tsx` | Full-screen consent modal — shows exactly what is/isn't captured, env var display, "Not now" + "Enable" buttons; `ap-consent-*` CSS |
| #94 | `src/shared/ipc.ts` + `src/main/index.ts` | `AgentProxyState` in `GlassState`; three IPC handlers: `wingman-agent-proxy-enable`, `wingman-agent-proxy-disable`, `wingman-agent-proxy-consent-grant` |
| #95 | `src/renderer/useGlassState.ts` | `agentProxy` fallback state |
| #96 | `src/renderer/panel/WingmanPanel.tsx` + `glass.css` | Agent proxy toggle in active panel (with "Copy env" button); consent modal overlay; "Agent activity" section in report; `wm-hb-agent-*` + `wm-hb-proxy-copy` CSS |
| #97 | `src/shared/wingmanSession.ts` | `agentCalls: AgentCallSummary[]` on session; `agentInterceptionWasActive` on report; prompt builder + report builder updated |
| #98 | `src/test/agentProxy.test.ts` | 52 unit tests for all pure functions |
| #99 | `package.json` | Added to test runner; typecheck + full suite clean |

**Consent + permission model:**
- First use: full-screen consent modal shows capture/never-capture lists before anything starts
- Per-session: proxy toggle defaults **Off** each new session — user must actively enable it
- Revocable: "Not now" closes modal without granting; toggle can be turned off at any time
- `wingman-agent-proxy-enable` checks `consented` first — if false, shows modal instead of starting

**Streaming design (zero latency):**
- Each SSE chunk is piped to the client synchronously before any accumulation
- `text_delta` chunks are accumulated up to `RESPONSE_SNIPPET_LEN` (300) then discarded
- `input_json_delta` chunks (tool inputs) are explicitly ignored — never touched

---

## What shipped in this update — GitHub Integration (Tasks #108–#114)

Wingman reports now include GitHub PR context when a PAT is configured. After a session ends and the AI report is visible, Glass asynchronously fetches the open PR for the current branch and streams in title, description snippet, review decision, and CI check rollup — all without blocking the report display.

### Authentication model

Same approach as GitHub CLI and VS Code: Fine-grained PAT encrypted via `safeStorage` (Electron macOS Keychain-backed AES). Stored at `~/.iivo-glass/github.enc` as an encrypted binary blob. Token is only decrypted in memory for the duration of the API call — never in GlassState, never logged.

| Task | File | What it does |
|------|------|--------------|
| #108 | `src/shared/githubTypes.ts` | Pure module — `GitHubConfig`, `GitHubRepoInfo`, `GitHubPRSummary`, `GitHubCheckRollup`, `GitHubPRContext`, `GitHubPATState`; `parseGitHubRemote` (HTTPS + SSH + GHE); display helpers `reviewDecisionLabel/Token`, `checkRollupLabel/Token`; `parseReviewDecision`, `deriveCheckRollupStatus`, `truncatePRBody` |
| #109 | `src/shared/githubClient.ts` | Pure API client using `fetch()` — typed errors (`GitHubAuthError`, `GitHubRateLimitError`, `GitHubNotFoundError`); `ghFetch` with 8s AbortController timeout; `fetchOpenPRForBranch`, `fetchPRByNumber`, `fetchCheckRollup`, `fetchPRContext` |
| #110 | `src/main/githubService.ts` | Main-process PAT storage — `savePAT` / `loadPAT` / `clearPAT` / `isPATConfigured`; `detectGitHubRemote` + `detectCurrentBranch` via `git` subprocess; `fetchSessionPRContext` (master entry, never throws) |
| #111 | `src/main/index.ts` + `src/shared/wingmanSession.ts` + `src/shared/ipc.ts` + `src/renderer/useGlassState.ts` | Non-blocking GitHub async block in `wingman-end`; `githubPR?` + `githubTokenInvalid?` on `WingmanReport`; `githubPATConfigured` + `githubTokenInvalid` in `GlassState`; three IPC commands; startup PAT check |
| #112 | `src/renderer/panel/WingmanPanel.tsx` + `glass.css` | `PRSection` component — PR title, draft badge, review decision badge, CI badge, body snippet, failing check names, meta line; PAT setup nudge (when no PR + not configured); token-invalid warning; `wm-hb-pr-*` CSS classes |
| #113 | `src/test/githubTypes.test.ts` | 46 unit tests for all pure functions in `githubTypes.ts` |
| #114 | `package.json` | Added to test runner; typecheck + full suite clean |

**Non-blocking design:**
- `push()` fires before GitHub fetch begins — report is immediately visible
- GitHub fetch runs in `void (async () => {...})()` — any failure is silently caught
- `result.context` merged into `wingmanState.report.githubPR` then `push()` called again
- Token-invalid state surfaces in GlassState for persistent nudge until PAT is refreshed

**V1 limitations (documented, not bugs):**
- `reviewDecision` defaults to `"unknown"` — REST API v3 doesn't expose it (requires GraphQL); a future upgrade can add GraphQL
- No OAuth flow — PAT-only in V1
- No GitHub Enterprise SSH support (HTTPS GHE works)

---

## What shipped in this update — GitHub PAT Settings UI (Task #115)

`GitHubPATSection` is a self-contained React component inside `WingmanPanel.tsx`'s `ReportView`. It replaces the original inline nudge and token-invalid banner with a full settings widget that handles all 5 states of GitHub PAT configuration without requiring a separate settings page.

### Component states

| State | Trigger | User sees |
|-------|---------|-----------|
| `nudge` | Not configured, not editing | Header + green "Not connected" pill + description + "Connect GitHub" button |
| `editing` | User clicked Connect, or `tokenInvalid=true` on mount | Input field (password), show/hide toggle, Save/Cancel buttons, inline validation error |
| `saving` | `handleSave()` called, waiting for `configured` prop to flip | Spinner in button, input disabled |
| `connected` | `configured=true`, not editing, not invalid | Header + green "Connected" pill + "Remove token" / "Update token" actions |
| `token-invalid` | `tokenInvalid=true` from GlassState | Amber warning banner + inline form auto-opened (or dismissed inline link) |

### State machine design

- Display state is fully derived from props (`configured`, `tokenInvalid`) + two local flags (`isEditing`, `dismissedInvalid`)
- **`prevConfigured` ref pattern**: A `useEffect` on `configured` compares previous vs current value. When it transitions `false → true` while `saving=true`, the save succeeded — component transitions to `connected` state and shows a "Saved ✓" flash for 2.5s
- **`dismissedInvalid` flag**: When `tokenInvalid=true` and user clicks Cancel, `isEditing` goes false but `dismissedInvalid` is set to `true`. The warn banner switches from "re-enter below" to an inline "Update token" link that re-opens the form on click. This ensures the user always has a way back into the form without being stranded with a non-interactive banner
- `tokenInvalid` useEffect resets `dismissedInvalid=false` if the prop becomes true again (e.g. another failed API call)

### Bug fix: cancel-while-invalid strands warn banner

Without `dismissedInvalid`, cancelling while `tokenInvalid=true` left the warn banner saying "please re-enter below" with nothing below it and no way to reopen the form. Fixed by switching to an inline amber underlined button (`wm-hb-gh-inline-reopen`) when dismissed.

### CSS additions (`glass.css`)

New `wm-hb-gh-*` block appended after `.wm-hb-pr-nudge-text--warn`:

| Class | Purpose |
|-------|---------|
| `.wm-hb-gh-header` | Row with label + status pill |
| `.wm-hb-gh-status` + variants `--ok/--saved/--warn` | Colored pill (green/amber) |
| `.wm-hb-gh-status-dot` | 6px dot inside pill |
| `.wm-hb-gh-lock-icon` | CSS-drawn padlock (no image assets) — 8×10px rectangle + 5px arch using border-radius |
| `.wm-hb-gh-connected-body` / `.wm-hb-gh-nudge-body` | State-specific body containers |
| `.wm-hb-gh-warn-banner` | Amber warning bar for token-invalid state |
| `.wm-hb-gh-form` / `.wm-hb-gh-input-row` / `.wm-hb-gh-input` / `.wm-hb-gh-showhide` | PAT entry form |
| `.wm-hb-gh-error` | Inline validation error text (amber) |
| `.wm-hb-gh-security-hint` | "Stored encrypted · Never logged" hint line |
| `.wm-hb-gh-inline-reopen` | Amber underlined button for dismissed-invalid state |
| `wm-hb-gh-btn-*` variants | `save`, `ghost`, `connect`, `secondary`, `remove`, `danger` — purple/transparent/red button variants |

### Files changed (Task #115)

| File | Change |
|------|--------|
| `src/renderer/panel/WingmanPanel.tsx` | Added `GitHubPATSection` component; updated `ReportView` to accept `githubTokenInvalid` prop; replaced inline nudge/warn with `<GitHubPATSection>`; updated call site |
| `src/renderer/styles/glass.css` | Appended `wm-hb-gh-*` CSS block (~90 lines) |

No new tests — the component is a pure renderer with no business logic. All behaviour is covered by the state machine design and the existing GitHub integration unit tests.

---

## What shipped in this update — True Claim Verification Engine (Tasks #102–#107)

After a Wingman session ends and the AI report is generated, Glass now programmatically checks certain claims instead of relying on "could not verify" language. Static checks run in pure functions instantly; dynamic checks (tsc, npm test) run async after the report is already visible — they never block the user from reading the report.

### Verification claim types

| Claim type | How resolved | Signal source |
|------------|--------------|---------------|
| `terminal_resolved` | Static (pure) | Were terminal errors followed by a success event? |
| `agent_on_scope` | Static (pure) | Do intercepted agent calls contain goal-related terms? |
| `files_match_goal` | Static (pure) | Git diff `scopeHint` from `analyzeScopeMatch()` |
| `typecheck` | Dynamic (runner) | `tsc --noEmit` exit code + error count |
| `tests_pass` | Dynamic (runner) | `npm test` exit code |

### Verification result statuses

| Status | Meaning | UI treatment |
|--------|---------|--------------|
| `verified` | Check ran and the claim holds | Green badge |
| `contradicted` | Check ran and the claim is false | Red badge — shown prominently |
| `inconclusive` | Check ran but result is ambiguous | Yellow badge |
| `skipped` | Check could not run (no repo, timeout, error) | Grey — never surfaced as failure |

| Task | File | What it does |
|------|------|--------------|
| #102 | `src/shared/verificationEngine.ts` | Pure module — all types, claim extractors (`extractTypecheckClaim`, `extractTestsClaim`, `resolveTerminalClaim`, `resolveAgentScopeClaim`, `resolveFilesMatchGoalClaim`, `extractClaims`), result builders, formatters (`statusLabel`, `statusToken`, `verificationSummaryLine`, `formatVerificationForPrompt`) |
| #103 | `src/main/verificationRunner.ts` | Main-process runner — `runTypecheckClaim` (tsc --noEmit), `runTestsClaim` (npm test), `detectTestScript`, `runVerification` (master entry, never throws) |
| #104 | `src/main/index.ts` + `src/shared/wingmanSession.ts` | Non-blocking async verification block after `push()` in `wingman-end` handler; `verificationResults?: VerificationReport` on `WingmanReport` |
| #105 | `src/renderer/panel/WingmanPanel.tsx` + `glass.css` | `VerificationSection` component — summary line, per-result rows with status badge + evidence; `wm-hb-verify-*` CSS classes |
| #106 | `src/test/verificationEngine.test.ts` | 44 unit tests for all pure functions |
| #107 | `package.json` | Added to test runner; typecheck + full suite clean |

**Non-blocking design:**
- `push()` is called before verification starts — user sees report immediately
- Verification runs in `void (async () => {...})()` — any failure is silently caught
- Results stream into the report once complete: `wingmanState.report.verificationResults` is set and `push()` called again
- `CHECK_TIMEOUT_MS = 10_000` — each dynamic check hard-times out after 10 seconds

**Privacy + safety:**
- `tsc --noEmit` and `npm test` are read-only commands — they never modify files
- `execFile` (not `exec`) — no shell injection possible
- Working directory is always the user's detected repo root — never a system path
- Stdout/stderr truncated to 300 chars before storage

---

## What shipped earlier in v0.5.0

### Power 1 — Cross-session memory (Tasks #70–#74)

Wingman now remembers past sessions across restarts. Sessions are saved to a JSONL file on disk, searchable by keyword, and surfaced in the report view as "Similar past sessions."

| Task | File | What it does |
|------|------|--------------|
| #70 | `src/shared/wingmanMemory.ts` | `WingmanSessionRecord` type, JSONL append/read/search, `formatSessionAge`, `formatSessionDuration` |
| #71 | `src/main/index.ts` | Auto-save to JSONL on `wingman-end`; `wingman-search-sessions` IPC command; `wingmanMemory` in `GlassState` |
| #72 | `src/shared/ipc.ts` + `src/renderer/useGlassState.ts` | `WingmanMemoryState` in GlassState; search results + loading flag; fallback state |
| #72 | `src/renderer/panel/WingmanPanel.tsx` | Report view now shows up to 3 past similar sessions; `PastSessionCard` component (expandable) |
| #73 | `src/test/wingmanMemory.test.ts` | 40 unit tests for all memory helpers |
| #74 | `package.json` | Added to test runner; typecheck + full suite clean |

**Memory contract:**
- Storage: `~/.iivo-glass/wingman-sessions.jsonl` (append-safe, crash-safe)
- Search: keyword match across goal + summary + keyFindings (case-insensitive)
- Privacy: on-device only, never sent to any server
- Session record format: `WingmanSessionRecord` — id, goal, startedAt, endedAt, duration, appsUsed, summary, keyFindings, notVerified, warningsIssued, nextSteps

---

### Power 2 — Terminal awareness (Tasks #75–#77)

Wingman can read terminal output (read-only, via macOS Accessibility API / osascript) when the user opts in. Errors, test failures, and build successes are auto-captured into the session as structured events.

| Task | File | What it does |
|------|------|--------------|
| #75 | `src/shared/terminalEvents.ts` | Full terminal event type system + pure parser (no Electron imports) |
| #76 | `src/shared/wingmanSession.ts` | `terminalEvents: TerminalEvent[]` + `terminalWatching: boolean` on session; `terminalEvents` in report |
| #76 | `src/shared/ipc.ts` | `wingman-terminal-toggle` GlassCommand |
| #77 | `src/main/index.ts` | `readFrontTerminalOutput()` — osascript for Terminal.app + iTerm2, null for others; `startTerminalWatching()` 10s interval; `stopTerminalWatching()`; auto-note on error event; loop detection from terminal events |

**Terminal awareness contract:**
- Opt-in only: `terminalWatching: false` by default
- Toggle: `wingman-terminal-toggle` IPC command
- Supported: Terminal.app, iTerm2 (scripting dictionary read)
- Graceful null: Ghostty, Warp, Kitty, Alacritty return null (no crash, no error)
- Poll interval: 10 seconds
- Deduplication: 60-second fingerprint window (type + first 50 chars of snippet)
- Loop detection: same error fingerprint 3× within 20 minutes → `loopWarning: true` + notice
- Privacy: last 120 lines of output, only error/success signal lines retained (not raw output), nothing sent to server
- Auto-note: each unique terminal event creates a `source: "wingman"` note in the session

**Detection patterns (15 precedence levels):**
1. TypeScript compiler errors (TS_ERROR_RE)
2. Error count summary ("N errors")
3. Jest/Vitest FAIL line
4. Jest bullet failures (● test name)
5. Node test runner failures (not ok N)
6. Mocha failures ("N failing")
7. Node runtime errors (TypeError/ReferenceError/etc. prefix)
8. Uncaught exceptions
9. Stack traces with error context
10. npm ERR!
11. Build success ("Build succeeded", "Compiled successfully", Vite built)
12. Jest pass ("Tests: N passed")
13. All tests pass ("All tests passed")
14. Mocha pass ("N passing")
15. Node test runner pass (ok N — with passing/passed context)

---

### Power 3 — Hybrid panel design (Tasks #78–#79)

WingmanPanel rebuilt from 519 lines to the full Liquid Glass + Signal hybrid design.

| Task | File | What it does |
|------|------|--------------|
| #78 | `src/renderer/panel/WingmanPanel.tsx` | Complete rebuild — arc bar, vitals, spotlight card, unified feed, terminal toggle, hybrid report view |
| #79 | `src/renderer/styles/glass.css` | +370 lines `wm-hb-*` CSS — all 3 states, arc, vitals, spotlight, feed, toggle, report |

**Design system (`wm-hb-*`):**

| Element | CSS token | Notes |
|---------|-----------|-------|
| Panel shell | `wm-hb-panel` | `border-left: 2.5px` + `border-top: 2px` in `--wm-accent` |
| Error state | `wm-hb-panel--error` | `--wm-accent: rgba(226,75,74,0.90)` |
| Healthy state | `wm-hb-panel--healthy` | `--wm-accent: rgba(123,186,58,0.90)` |
| Neutral state | `wm-hb-panel--neutral` | `--wm-accent: rgba(255,255,255,0.18)` |
| Arc bar | `wm-hb-arcrow` / `wm-hb-arcline` / `wm-hb-arcfill` | Signal-style timeline; event dots positioned proportionally |
| Arc timestamp | `wm-hb-arctime` | Time of last terminal event, right-aligned |
| Vitals row | `wm-hb-vitals` / `wm-hb-vital` | 3 columns: error count, last pass, duration |
| Spotlight | `wm-hb-spotlight` | Most recent terminal event — error (red bg tint) or healthy (green bg tint) |
| Feed | `wm-hb-feed` / `wm-hb-fi` | Unified: terminal events (red/green pip) + inspections (purple pip) + notes (gray pip) |
| Feed text | `wm-hb-ftext` | Informative: "build error: TS2345", "inspect: null check missing", "note: ..." |
| Terminal toggle | `wm-hb-toggle` / `wm-hb-pill-on` / `wm-hb-pill-off` | Bottom strip; opt-in toggle wired to `wingman-terminal-toggle` |
| Backdrop | `backdrop-filter: blur(20px) saturate(1.5)` | Liquid Glass see-through on macOS vibrancy window |

**Active panel sections (top → bottom):**
1. Arc bar — fill % based on elapsed time (60 min = full); colored dots for each event
2. Vitals — Errors / Last pass / Duration (3 glassy columns)
3. Task goal — `wm-hb-task-lbl` + `wm-hb-task-goal`
4. Loop warning (amber) — when `session.loopWarning || detectTerminalLoop(...)`
5. Spotlight card — most recent terminal event (error=red tint, healthy=green tint) or last inspection
6. Unified feed — last 5 events, chrono order, monospace labels
7. Inspect screen / End buttons
8. Add note inline row
9. Privacy label — "App titles + terminal · Screenshot only on inspect"
10. Terminal toggle strip

**Report sections:**
1. Arc bar replay (100% fill)
2. Status badge (Resolved / Unresolved) + title + meta
3. Goal
4. What happened (AI summary)
5. Terminal events (timestamped, colored pips)
6. Key findings
7. Could not verify
8. Warnings
9. Next steps
10. Similar past sessions (from cross-session memory)
11. New session button

---

### Tests (Tasks #80–#81)

| Task | File | Count |
|------|------|-------|
| #80 | `src/test/terminalEvents.test.ts` | 62 unit tests |
| #81 | `package.json` | Added to test runner |

**terminalEvents.test.ts covers:**
- `formatTerminalSnippet` — ANSI stripping, first-line extraction, truncation
- `buildEventLabel` — all 5 event type prefixes
- `buildTerminalEvent` — field presence, snippet trim, timestamp
- `terminalEventFingerprint` — consistency, type-sensitivity, char limit, whitespace normalisation
- `isDuplicateTerminalEvent` — empty list, within window, outside window, different type
- `parseTerminalOutput` — all 15 detection patterns; precedence (error beats success); dedup; source propagation; max-1-event-per-call invariant
- `isTerminalApp` — known apps, non-terminal apps, case-insensitive, empty string
- `detectTerminalLoop` — empty, fewer than 3, same error 3×, outside window, success events ignored, mixed types, different fingerprints

---

## Cumulative unit test breakdown

| Suite | Count | What it covers |
|-------|-------|----------------|
| `wingmanSession.test.ts` | 41 | Factory, snapshot dedup, deriveAppsUsed, detectLoop, detectScopeDrift, buildVerificationChecklist, buildWingmanReport, buildWingmanReportPrompt, confidence contract |
| `wingmanMemory.test.ts` | 40 | JSONL append/read, search relevance, ranking, formatSessionAge/Duration, edge cases |
| `terminalEvents.test.ts` | 62 | All 15 parse patterns, dedup, fingerprint, loop detection, isTerminalApp |
| `gitDiff.test.ts` | 60 | parseGitNumstat, parseGitNameStatus, buildGitDiffSummary, analyzeScopeMatch, formatDiffForPrompt, extractProjectNameFromTitle, buildRepoCandidatePaths, shortRef |
| `agentProxy.test.ts` | 52 | sanitizeHeaders, extractRequestSnippets, extractResponseSnippets, extractStreamingSnippets, buildAgentCallSummary, analyzeAgentScope, formatCallsForPrompt, shortModelName, formatCallTime, privacy contracts |
| `verificationEngine.test.ts` | 44 | extractTypecheckClaim, extractTestsClaim, resolveTerminalClaim, resolveAgentScopeClaim, resolveFilesMatchGoalClaim, extractClaims, buildVerificationResult, resolveStaticClaim, buildSkippedResult, buildVerificationReport, formatVerificationForPrompt, statusLabel, statusToken, verificationSummaryLine |
| `githubTypes.test.ts` | 46 | parseGitHubRemote (HTTPS/SSH/GHE/non-GitHub/edge cases), reviewDecisionLabel/Token (5 values each), checkRollupLabel/Token (4 values each), parseReviewDecision (all GraphQL strings + null/undefined), deriveCheckRollupStatus (empty/passing/failing/timed_out/pending/capped names), truncatePRBody (null/short/long/CRLF) |
| All prior suites (v0.4.0) | 1,049 | Unchanged |
| **Total** | **1,394** | |

---

## §1–§20 contract coverage (updated)

| § | Feature | Status |
|---|---------|--------|
| 1 | Cold launch | ✅ Unit + E2E |
| 2 | First-run onboarding | ✅ Electron overlay |
| 3 | Command bar | ✅ Unit + E2E |
| 4 | Direct response | ✅ Unit + E2E |
| 5 | Pin | ✅ Unit + E2E |
| 6 | Auto-dismiss | ✅ Unit + E2E |
| 7 | Remember this | ✅ Unit + E2E |
| 8 | Council handoff | ✅ Unit + E2E |
| 9 | Listen Mode | ✅ Unit + E2E + scripts |
| 10 | Live Notes | ✅ Unit + scripts + E2E |
| 11 | Live Translate | ✅ Unit + E2E |
| 12 | Visual Ask | ✅ Unit + E2E |
| 13 | Screen context | ✅ Unit + E2E (partial) |
| 14 | Connect panel | ✅ Unit + E2E |
| 15 | Settings | ✅ Unit + E2E |
| 16 | Update check | ⚠️ Unit only (E2E skipped) |
| 17 | Quit cleanly | ✅ E2E |
| 18 | Passive Context Engine | ✅ Unit |
| 19 | Meeting Intelligence | ✅ Unit (45) + QA script |
| 20 | Wingman Mode | ✅ Unit (143) + E2E (14) + QA script |

---

## Wingman type system (v0.5.0)

```typescript
// Session
WingmanSession {
  id, goal, startedAt, endedAt?,
  appSnapshots, inspections, notes,
  loopWarning,
  terminalEvents: TerminalEvent[],
  terminalWatching: boolean,
  agentCalls: AgentCallSummary[],     // NEW — agent interception
}

// Terminal event
TerminalEvent {
  id: string;
  type: "build_error" | "test_failure" | "runtime_error" | "build_success" | "test_pass";
  label: string;    // "build error: null not assignable TS2345"
  snippet: string;  // raw, max 200 chars
  timestamp: number;
  source: string;   // "Terminal" | "iTerm2" | …
}

// Agent call summary (NEW — privacy-minimised)
AgentCallSummary {
  id, timestamp, model,
  systemPromptSnippet?: string,   // ≤200 chars
  userMessageSnippet: string,     // ≤300 chars
  responseSnippet: string,        // ≤300 chars
  inputTokens?, outputTokens?,
  hasToolUse: boolean,
  toolNames: string[],            // names only — inputs NEVER captured
  wasStreaming: boolean,
}

// Proxy state (NEW)
AgentProxyState {
  consented: boolean,
  running: boolean,
  port: number,            // default 7421, falls back to 7422–7425
  showConsentModal: boolean,
}

// Report (updated)
WingmanReport { …, terminalEvents?: TerminalEvent[], agentCalls?: AgentCallSummary[], agentInterceptionWasActive?: boolean }

// Memory
WingmanSessionRecord { id, goal, startedAt, endedAt, duration, appsUsed, summary, keyFindings, notVerified, warningsIssued, nextSteps }
WingmanMemoryState   { searchResults: WingmanSessionRecord[], loading: boolean, totalSessions: number }
```

---

## IPC commands (full Wingman set)

| Command | Added | What it does |
|---------|-------|--------------|
| `wingman-start` | v0.4.0 | Begin session with goal |
| `wingman-end` | v0.4.0 | End session, generate report, auto-save to memory |
| `wingman-inspect` | v0.4.0 | Screenshot + AI analysis |
| `wingman-add-note` | v0.4.0 | User note into session |
| `wingman-search-sessions` | v0.5.0 | Search JSONL memory by keyword |
| `wingman-terminal-toggle` | v0.5.0 | Toggle terminal watching on/off |
| `wingman-agent-proxy-enable` | v0.5.0 | Start local proxy (shows consent modal if not yet consented) |
| `wingman-agent-proxy-disable` | v0.5.0 | Stop local proxy |
| `wingman-agent-proxy-consent-grant` | v0.5.0 | Grant consent + clear modal |

---

## What shipped in this update — Full QA Automation + Security Hardening (Tasks #121–#128)

### Security fixes (Task #121 — applied to codebase)

| File | Fix |
|------|-----|
| `src/main/index.ts` | `exec()` replaced with `execFileAsync("osascript", ["-e", script])` — eliminates shell injection in browser title detection |
| `src/main/agentProxyServer.ts` | `MAX_SSE_ACCUMULATE_BYTES = 50_000` cap on SSE accumulation — prevents unbounded memory growth on large streaming responses |
| `src/main/githubService.ts` | `isPATConfigured()` now checks `existsSync(PAT_STORE_PATH)` first — avoids unnecessary `safeStorage.decryptString` on startup when no PAT exists |

### Dev-only IPC backdoors (Task #122)

4 new commands gated by `process.env.IIVO_GLASS_TEST !== "1"`. Used by automated tests to reach states that are hard/impossible to trigger via normal UI interaction.

| Command | Purpose |
|---------|---------|
| `wingman-debug-inject-inspection` | Injects a real `WingmanInspection` into the session, runs `detectLoop` + `detectScopeDrift` on real code paths |
| `wingman-debug-set-token-invalid` | Sets `githubPATState.tokenInvalid = true` — same state as a real 401 from GitHub |
| `wingman-debug-get-session` | Returns a snapshot of the current session for assertion |
| `wingman-debug-clear-state` | Stops intervals, resets `wingmanState` / `wingmanMemoryState` / `githubPATState` |

Added to `src/shared/ipc.ts` `GlassCommand` union. Require Glass to be started with `IIVO_GLASS_TEST=1`.

### data-testid coverage (Task #123)

All interactive elements in `GitHubPATSection` and `AgentProxyConsentModal` now have `data-testid` attributes for Playwright click-through automation:

`GitHubPATSection`: `wingman-github-pat-section`, `wingman-github-pat-connect-btn`, `wingman-github-pat-input`, `wingman-github-pat-save-btn`, `wingman-github-pat-cancel-btn`, `wingman-github-pat-status-connected`, `wingman-github-pat-status-saved`, `wingman-github-pat-status-invalid`, `wingman-github-pat-update-btn`, `wingman-github-pat-remove-btn`, `wingman-github-pat-confirm-remove-btn`, `wingman-github-pat-cancel-remove-btn`, `wingman-github-pat-warn-banner`, `wingman-github-pat-inline-reopen-btn`

`AgentProxyConsentModal`: `agent-proxy-consent-modal`, `agent-proxy-consent-envvar`, `agent-proxy-consent-note`, `agent-proxy-consent-dismiss`, `agent-proxy-consent-enable` (already existed — verified complete)

### New QA scripts (Tasks #124–#125)

| Script | npm run | What it covers |
|--------|---------|----------------|
| `scripts/glass-qa-wingman-full.mjs` | `qa:wingman:full` | §1–§20: all MANUAL_QA IPC-testable sections including loop detection, scope drift, and token-invalid via dev backdoors |
| `scripts/glass-qa-agent-proxy-live.mjs` | `qa:agent:proxy` | Real HTTP client through proxy — verifies forwarding, SSE streaming, capture in GlassState, privacy (API key stripped) |

`glass-qa-wingman-full.mjs` gracefully skips §15–§19 (backdoor sections) when Glass is not in test mode, with clear skip messages.

`glass-qa-agent-proxy-live.mjs` requires `ANTHROPIC_API_KEY` and makes ~70 real tokens of API calls per run (claude-haiku-4-5).

### New Playwright E2E specs (Tasks #126–#127)

| Spec | npm run | What it covers |
|------|---------|----------------|
| `tests/e2e/glass-wingman-ui.spec.ts` | `e2e:wingman-ui` | Full UI click-through: all 5 PAT states (B1–B8), dismissedInvalid flow (C1–C3), agent proxy consent modal (D1–D4), terminal awareness (E1–E3), loop detection via backdoor (F1), report structure (G1–G4), cross-session memory (H1–H3), privacy invariants (I1–I3) |
| `tests/e2e/glass-meeting-intel.spec.ts` | `e2e:meeting-intel` | Meeting Intelligence E2E: transcript injection via `add-transcript-chunk`, type classification (A1), moment capture (A2), moment delete (A3), moment add (A4), debrief structure (A5), type override notice (A6), debrief UI (A7–A9), no audio during Wingman (regression) |

`glass-wingman-ui.spec.ts` uses the same backdoor pattern as the QA scripts — calls `window.glass.send({ type: "wingman-debug-*" })` and gracefully skips backdoor-dependent tests when `IIVO_GLASS_TEST=1` is not set.

### New npm scripts

| Script | Command |
|--------|---------|
| `qa:wingman` | `node scripts/glass-qa-wingman.mjs` |
| `qa:wingman:full` | `node scripts/glass-qa-wingman-full.mjs` |
| `qa:wingman:full:backdoors` | `IIVO_GLASS_TEST=1 node scripts/glass-qa-wingman-full.mjs` |
| `qa:agent:proxy` | `node scripts/glass-qa-agent-proxy-live.mjs` |
| `e2e:wingman-ui` | `npm run build && playwright test tests/e2e/glass-wingman-ui.spec.ts ...` |
| `e2e:meeting-intel` | `npm run build && playwright test tests/e2e/glass-meeting-intel.spec.ts ...` |

---

## Known remaining gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| `wingman-inspect` E2E | Medium | Requires live screen; tested via QA script only |
| Update check E2E | Low | Stubbed server required |
| Git diff E2E | Low | Needs real git repo in Playwright; unit-tested (60 tests) |
| Verification runner integration test | Medium | `runTypecheckClaim`/`runTestsClaim` need a real or mock repo; unit-tested at pure layer only |
| GitHub PAT management UI | ✅ Done | `GitHubPATSection` — 5 states, dismissedInvalid fix, testid coverage, Playwright spec (B1–B8, C1–C3) |
| Meeting Intelligence E2E | ✅ Done | `glass-meeting-intel.spec.ts` — transcript injection, classification, moment CRUD, debrief |
| Agent proxy integration test | ✅ Done | `glass-qa-agent-proxy-live.mjs` — real HTTP round-trip, privacy contract, SSE streaming |
| GitHub GraphQL reviewDecision | Low | V1 defaults to "unknown"; needs GraphQL endpoint |
| GitHub integration test | Medium | `fetchSessionPRContext` needs mock server or recorded fixtures |

---

## WINGMAN_BUILD_PLAN.md checklist (v0.5.0)

- [x] Wingman mode activates from the dock
- [x] User can set a task goal
- [x] App/window timeline tracks passively throughout session
- [x] Inspect Screen captures screenshot and returns task-aware response
- [x] Responses never use "verified" language
- [x] Loop detection fires when same error appears 2× (screen) or 3× (terminal) 
- [x] Scope drift warning fires when inspection mentions out-of-scope areas
- [x] Session ends with structured report including observedOnly + notVerified
- [x] Panel shows session state — not a chat window
- [x] Privacy indicator visible throughout session
- [x] Cross-session memory — sessions saved + searchable + shown in report
- [x] Terminal awareness — opt-in, read-only, error/success auto-capture
- [x] Terminal loop detection — same error 3× in 20 min → warning
- [x] Hybrid panel design — Liquid Glass + Signal arc bar + informative feed text
- [x] Git diff integration — repo discovery, diff capture, scope analysis, report display
- [x] Agent API interception — local proxy, privacy-minimised snippets, consent modal, session scope
- [x] Agent activity visible in Wingman report — model, tool names, message snippets
- [x] Agent proxy toggle in active panel — per-session opt-in with env var copy button
- [x] True claim verification — programmatic post-session checks (tsc, npm test, terminal, agent scope, file-goal alignment)
- [x] Verification results in report — status badges (verified / contradicted / inconclusive / skipped) + evidence
- [x] Non-blocking verification — report visible immediately; results stream in async
- [x] GitHub integration — PAT + safeStorage, PR title/description/CI/review in Wingman reports
- [x] GitHub PR context in report — title, draft badge, review decision, CI rollup, body snippet
- [x] Non-blocking GitHub fetch — PR section appears after report is already visible
- [x] Token-invalid state surfaced in UI — persistent nudge until PAT refreshed
- [x] GitHub PAT settings UI — `GitHubPATSection` component with 5 states (nudge/editing/saving/connected/token-invalid)
- [x] `dismissedInvalid` bug fix — cancel-while-invalid no longer strands warn banner
- [x] CSS-drawn padlock icon — no image assets, pure CSS border-radius arch
- [x] Inline "Update token" link when banner is dismissed in invalid state
- [x] QA script §13–§14 — GitHub PAT management + verification results shape checks
- [x] GLASS_CONTRACT.md §20 updated — v0.5.0 feature list, 353 unit tests across 9 suites, changelog entry
- [x] All unit tests passing (1,394 / 0)
- [x] Typecheck clean
- [x] BASELINE_v0.5.0.md written
- [x] Security fix: exec()→execFileAsync (no shell injection in browser title reader)
- [x] Security fix: SSE accumulation cap (50KB, prevents unbounded memory)
- [x] Security fix: isPATConfigured existsSync fast-path (no decrypt on cold start)
- [x] Dev-only IPC backdoors (4 commands, IIVO_GLASS_TEST=1 guard)
- [x] data-testid attributes on all GitHubPATSection + AgentProxyConsentModal elements
- [x] glass-qa-wingman-full.mjs — §1–§20 full QA including backdoor sections
- [x] glass-qa-agent-proxy-live.mjs — real HTTP proxy roundtrip + privacy contract
- [x] glass-wingman-ui.spec.ts — all 5 PAT states, dismissedInvalid, consent modal, loop detection, memory
- [x] glass-meeting-intel.spec.ts — transcript injection, classification, moment CRUD, debrief
- [x] 5 new npm scripts added (qa:wingman, qa:wingman:full, qa:agent:proxy, e2e:wingman-ui, e2e:meeting-intel)
