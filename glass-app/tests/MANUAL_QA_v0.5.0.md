# IIVO Glass — Manual QA Checklist v0.5.0

**Scope:** Everything shipped since Live Notes (Task #40)
**Covers:** Meeting Intelligence · Wingman v0.4.0 · Wingman v0.5.0 (memory, terminal, git diff, agent proxy, verification, GitHub, PAT UI)
**Status column:** ✅ Pass · ❌ Fail · ⚠️ Partial · ⬜ Not tested

---

## How to run

```
cd desktop-glass
npm run dev         # or: npm run glass:dev in a second terminal
```

For GitHub tests, have a git repo with a GitHub remote open in Cursor/terminal before starting a Wingman session.

---

## A. Meeting Intelligence

> Trigger: start a Listen session, let some transcript accumulate, then end.

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| A1 | Start a meeting/listen session — speak or play audio | Meeting type classified within ~30s (sync / sales / product / etc.) | ⬜ | |
| A2 | Continue speaking — key moments captured | Decision, action item, concern, or highlight appears in panel | ⬜ | |
| A3 | Manually delete a moment from the panel | Moment disappears immediately | ⬜ | |
| A4 | Manually add a note as a moment | Appears in moment list | ⬜ | |
| A5 | Trigger a debrief (End Session or command) | Debrief contains Meeting Intelligence section: moments, summary, action items | ⬜ | |
| A6 | Meeting type override mid-session | Panel shows "Re-scanning as [type]…" notice | ⬜ | |
| A7 | Debrief scroll | Dark scrollbar, no white scrollbar visible | ⬜ | Fixed in #35 |
| A8 | Debrief title/platform detection | Shows YouTube / Podcast / Zoom / etc. — not raw URL | ⬜ | Fixed in #35 |
| A9 | Debrief appears promptly | Loading notice shows immediately before AI call, not blank wait | ⬜ | Fixed in #35 |

---

## B. Live Translate (fixes since Live Notes)

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| B1 | Start translate → pause → Resume | Resume button works; audio restarts | ⬜ | Fixed #32 |
| B2 | Live Notes + Translate simultaneously | Both run; toggling translate-stop doesn't kill Live Notes audio | ⬜ | Fixed #33/#34 |
| B3 | Translation caption | Caption appears promptly on speech; no lag | ⬜ | Fixed #34 |
| B4 | Deepgram disconnect mid-session | Audio restarts automatically (no manual intervention needed) | ⬜ | Fixed #36 |

---

## C. Wingman — Core Session Lifecycle

> Activate Wingman from the mode card. Enter a goal. Start.

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| C1 | Wingman mode card visible in dock | "Wingman" card present; "Work" mode absent | ⬜ | |
| C2 | Goal input shows on inactive state | "What are we working on?" input + app detection | ⬜ | |
| C3 | Start Wingman with a goal | Panel switches to active state; pulsing indicator; goal displayed; timer running | ⬜ | |
| C4 | Passive app timeline | After 30s, switch apps; session should accumulate app names silently | ⬜ | No screenshots passively |
| C5 | Inspect Screen | Click "Inspect Screen"; loading state; response references goal + current screen content | ⬜ | |
| C6 | Inspect uses "observed"/"appears to" language | Never says "verified", "confirmed", "tested", "proven" as positive assertions | ⬜ | |
| C7 | Add Note via UI | Click "+ Add Note"; note stored; appears in session | ⬜ | |
| C8 | Loop detection | Same error in 2 consecutive inspections → panel warning appears | ⬜ | Hard to trigger manually; check log |
| C9 | Scope drift warning | Inspect screen showing something unrelated to goal → drift warning in panel | ⬜ | Hard to trigger manually |
| C10 | End session | Click "End Session"; spinner; report generated; panel switches to report state | ⬜ | |
| C11 | Report always has non-empty notVerified | "Could not verify" section present with at least one item | ⬜ | |
| C12 | "New Session" button | Returns to inactive state cleanly | ⬜ | |
| C13 | No audio during session | No microphone access; no audio capture | ⬜ | |

---

## D. Wingman — Cross-Session Memory

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| D1 | End a session | Session auto-saved to `~/.iivo-glass/wingman-sessions.jsonl` | ⬜ | Check file exists |
| D2 | Start second session with related goal | Report includes "Past sessions" section showing relevant prior session | ⬜ | |
| D3 | Search sessions via IPC | `wingman-search-sessions { query: "..." }` returns matching sessions | ⬜ | Can test via QA script |
| D4 | Past sessions section in report | Session goal, duration, summary snippet shown; clickable or readable | ⬜ | |

---

## E. Wingman — Terminal Awareness

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| E1 | Start Wingman; open Terminal | Terminal events feed appears in active panel (after opt-in) | ⬜ | |
| E2 | Run a failing command in terminal | Error auto-captured as a note in the session feed | ⬜ | e.g. `tsc --noEmit` with errors |
| E3 | Fix the error; run again | Success event captured | ⬜ | |
| E4 | Terminal loop detection | Same error 3× in 20 min → loop warning in panel | ⬜ | |
| E5 | Terminal events visible in report | "Terminal events" section in report with command/error entries | ⬜ | |
| E6 | Terminal toggle off | `wingman-terminal-toggle` disables capture; no more events | ⬜ | |

---

## F. Wingman — Git Diff

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| F1 | Start session in a git repo with uncommitted changes | At session end, "Code changes" section in report | ⬜ | |
| F2 | Report shows file list | File chips showing changed files | ⬜ | |
| F3 | Scope indicator | Scope matches goal keywords → "on scope"; doesn't match → "off scope" or "mixed" | ⬜ | |
| F4 | No git repo | "Code changes" section absent; session continues without error | ⬜ | |

---

## G. Wingman — Agent Proxy

> Point `ANTHROPIC_BASE_URL=http://127.0.0.1:7421` and use Claude Code / Cursor during session.

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| G1 | First-time enable | Consent modal appears with privacy contract details | ⬜ | |
| G2 | Consent modal shows what IS captured | Model name, system prompt ≤200 chars, last message ≤300 chars, tool names, token count | ⬜ | |
| G3 | Consent modal shows what is NOT captured | Full system prompt, full history, tool call inputs/outputs | ⬜ | |
| G4 | "Not now" dismisses without enabling | No proxy started | ⬜ | |
| G5 | "Enable" starts proxy | Active panel shows proxy toggle + env var | ⬜ | |
| G6 | Env var copy button | Copies `ANTHROPIC_BASE_URL=http://127.0.0.1:7421` to clipboard | ⬜ | |
| G7 | Agent calls visible in active panel | Live feed updates as agent makes API calls | ⬜ | |
| G8 | Report "Agent activity" section | Model name, tool names, message snippet, token count — no secrets | ⬜ | |
| G9 | Disable proxy | `wingman-agent-proxy-disable`; proxy stops; session continues | ⬜ | |
| G10 | Traffic forwarded correctly | Cursor/Claude Code works normally while proxy is active | ⬜ | |

---

## H. Wingman — Claim Verification

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| H1 | Run `tsc` or `npm test` during session | Report shows typecheck/test verification badge | ⬜ | |
| H2 | Verified claim | Green "Verified" badge | ⬜ | |
| H3 | Contradicted claim | Red "Contradicted" badge with evidence | ⬜ | |
| H4 | Inconclusive / skipped | Grey badge | ⬜ | |
| H5 | Report visible immediately | Verification badges stream in after report is already visible (non-blocking) | ⬜ | |
| H6 | Terminal error resolved claim | If error was seen then fixed, badge reflects resolution | ⬜ | |

---

## I. Wingman — GitHub Integration

> Requires: git repo with a GitHub remote + open PR on current branch + PAT configured.

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| I1 | PAT not configured — report shows nudge | "GitHub" section with "Not connected" pill + "Connect GitHub" button | ⬜ | |
| I2 | Click "Connect GitHub" | Form opens with PAT input field | ⬜ | |
| I3 | Enter invalid format (not `github_pat_*` / `ghp_*` / `gho_*`) | Inline validation error | ⬜ | |
| I4 | Enter valid PAT, click Save | Spinner; transitions to "Connected" state with green pill | ⬜ | |
| I5 | "Saved ✓" flash | Green flash for ~2.5s then settles on Connected | ⬜ | |
| I6 | Show/hide toggle on input | Eye icon toggles between password and plain text | ⬜ | |
| I7 | PR found — PR section in report | Title, draft badge (if draft), review decision badge, CI rollup badge, body snippet | ⬜ | |
| I8 | CI failing | Badge shows red "CI failing — N of M checks failed" + failing check names | ⬜ | |
| I9 | CI pending | Amber "CI pending" badge | ⬜ | |
| I10 | PR section appears after report | Report visible first; PR section streams in ~1-2s later (non-blocking) | ⬜ | |
| I11 | No open PR on current branch | PAT settings UI shown instead of PR section | ⬜ | |
| I12 | Token invalid (401) | Amber warning banner in PAT section; form auto-opens | ⬜ | Test with wrong PAT |
| I13 | Cancel while token-invalid | Warn banner stays but switches from "re-enter below" to inline "Update token" link | ⬜ | dismissedInvalid bug fix |
| I14 | Click "Update token" link | Form re-opens | ⬜ | |
| I15 | "Remove token" then confirm | PAT cleared; state returns to nudge | ⬜ | |
| I16 | Update token (replace existing) | "Update token" button in connected state opens form; save replaces | ⬜ | |
| I17 | Non-GitHub remote (GitLab, Bitbucket) | No PR section; PAT settings section shown | ⬜ | |

---

## J. GitHub PAT Settings UI — States

> Focused UI walkthrough of all 5 component states.

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| J1 | **Nudge state** — no PAT configured | Header "GitHub" + grey/green "Not connected" pill + description text + lock icon + "Connect GitHub" button | ⬜ | |
| J2 | **Editing state** — click Connect | Input field, show/hide toggle, Save + Cancel, "Stored encrypted · Never logged" hint | ⬜ | |
| J3 | **Saving state** — click Save with valid token | Button shows spinner; input disabled; cannot double-submit | ⬜ | |
| J4 | **Connected state** — save succeeds | Green "Connected" pill; "Saved ✓" flash; "Remove token" + "Update token" actions | ⬜ | |
| J5 | **Token-invalid state** | Amber "Invalid token" pill; warning banner; form auto-opened | ⬜ | |
| J6 | Cancel in editing (normal) | Returns to nudge or connected state cleanly | ⬜ | |
| J7 | Escape key in input | Same as Cancel | ⬜ | |
| J8 | Enter key in input | Same as Save | ⬜ | |
| J9 | CSS padlock icon | Padlock visible and styled (no broken image placeholder) | ⬜ | Pure CSS |

---

## K. Automated Test Suite

> Run these from terminal to confirm no regressions.

| # | Command | Expected | Status | Notes |
|---|---------|----------|--------|-------|
| K1 | `npm test` | 1,394 passing / 0 failing | ⬜ | |
| K2 | `npm run typecheck` | 0 TypeScript errors | ⬜ | |
| K3 | `npm run qa:auto` | All auto QA checks pass | ⬜ | Requires running Glass |
| K4 | `node scripts/glass-qa-wingman.mjs` | All §1–§14 checks pass | ⬜ | Requires running Glass |
| K5 | `npm run qa:meeting:live` | Meeting live QA passes | ⬜ | Requires audio |
| K6 | `npm run git:guard` | No blocked files in git | ⬜ | |
| K7 | `npm run e2e` | All Playwright E2E tests pass | ⬜ | Requires display |

---

## L. Regression — Core Glass Features

> Quick smoke test on features that existed before v0.5.0.

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| L1 | Cold launch | Glass opens; dock appears; no crash | ⬜ | |
| L2 | Listen mode | Audio capture starts; transcript appears | ⬜ | |
| L3 | Copilot mode | Copilot panel opens; session starts | ⬜ | |
| L4 | Translate mode | Translation captions appear | ⬜ | |
| L5 | Inspect (visual ask) | Screenshot captured; AI response shown | ⬜ | |
| L6 | In-app server URL setting | `ServerUrlEditor` in settings grid; URL saved + persists after relaunch | ⬜ | |
| L7 | Update check | Update available overlay if new version on server | ⬜ | |
| L8 | Hotkeys | Configured hotkeys trigger correct actions | ⬜ | |
| L9 | Quit cleanly | Cmd+Q; no zombie processes | ⬜ | |

---

## Known gaps (not testable manually without special setup)

- Loop detection (C8): requires two identical inspections — can be forced via QA script
- Scope drift (C9): keyword-based; hard to trigger precisely
- Deepgram reconnect (B4): requires killing network mid-session
- Agent proxy traffic (G10): requires setting env var in coding tool
- Token-invalid state (I12): requires an intentionally wrong PAT or a revoked one

---

*Generated: 2026-06-12 · IIVO Glass v0.5.0*
