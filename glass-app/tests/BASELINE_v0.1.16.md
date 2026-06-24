# IIVO Glass Test Baseline — v0.1.16

**Audited:** 2026-06-09
**Prior baseline:** `desktop-glass/tests/BASELINE_v0.1.15.md`
**Contract:** `desktop-glass/GLASS_CONTRACT.md` (§1–§18)
**App version:** `0.1.16` (`desktop-glass/package.json` — bump pending)

This file records the v0.1.16 delta: **Live Translate overhaul** — Deepgram Nova-3 streaming STT, DeepL translation backend, sentence-accumulation caption display, and supporting fixes. For full §1–§18 contract mapping and prior E2E suite, see `BASELINE_v0.1.15.md`.

---

## Executive summary

All prior E2E suites (85 tests) remain unchanged. This release adds **28 new E2E tests** covering §10 Live Notes (see `liveNotesE2e.test.ts`) and **39 new user journey tests** simulating a real video-watching session (see `liveNotesUserJourney.test.ts`). The Deepgram/DeepL live translate path requires live audio and real API keys and is covered by manual dev testing only.

---

## §10 Live Notes — New E2E Coverage (v0.1.16)

**Spec file:** `src/test/liveNotesE2e.test.ts` — **28 tests, all passing**

| # | Scenario | What it asserts |
|---|----------|-----------------|
| 1 | Empty session | No entries, no sections, listeningStatus=listening |
| 2 | Single short chunk | Thin transcript → zero notes produced |
| 3 | Mature key-idea moment | `keyIdeas` section populated |
| 4 | Mature action moment | `actionIdeas` section populated, no action-first card text |
| 5 | Moment with suggestedQuestion | `questions` section populated |
| 6 | Topic from moment | `currentTopic` set from key-idea summary |
| 7 | Topic fallback | Falls back to rolling transcript tail |
| 8 | Elapsed label present | `elapsedLabel` set when `listenStartedMs` provided |
| 9 | No elapsed label | `elapsedLabel` absent without `listenStartedMs` |
| 10 | Refresh not due | Gate returns false before interval |
| 11 | Refresh due | Gate returns true once interval elapses |
| 12 | First refresh always due | Returns true when `lastRefreshMs` undefined |
| 13 | Adaptive refresh interval | Fast/normal/slow intervals match transcript richness |
| 14 | Listen stopped | Notes remain, `listeningStatus=idle` |
| 15 | Refresh frozen after stop | Gate correctly not triggered |
| 16 | Short unclear transcript | `unclearTranscriptNote` returns honest empty-state hint |
| 17 | Long unclear fragment | Returns verbatim-truncated note with "needs more context" |
| 18 | unclearTranscriptNote never action-first | `isActionFirstListenCard` returns false |
| 19 | Duplicate chunk deduplication | `duplicateTranscriptCount` flagged, `transcriptChunkCount` accurate |
| 20 | `listenTranscriptChunksFromEvents` system_audio only | Non-audio events excluded |
| 21 | `listenTranscriptChunksFromEvents` dedupes | Identical chunks yield single entry |
| 22 | Full pipeline (events→chunks→notes) | End-to-end: events → `listenTranscriptChunksFromEvents` → `buildListenLiveNotes` → sections populated |
| 23 | Rolling transcript pipeline | `applyListenTranscriptFragment` → `buildListenLiveNotes` → notes appear |
| 24 | Checkpoint interval gate | `shouldWriteListenCheckpoint` fires at correct minute boundary |
| 25 | Checkpoint in final report | `buildListenReportSections` includes checkpoint section |
| 26 | Idempotency | Same input → identical output on repeated calls |
| 27 | Topic length cap | `currentTopic` never exceeds 160 chars |
| 28 | micStatus / sourceLabel | `micStatus=off`, `sourceLabel="System Audio"` always |

---

## §10 Live Notes — User Journey Coverage (v0.1.16)

**Spec file:** `src/test/liveNotesUserJourney.test.ts` — **51 tests, all passing**

Simulates a real user watching a Napoleon Hill "Think and Grow Rich" style video. Each test exercises a specific connection point in the live notes pipeline from audio chunk → pattern detection → note generation → visual state.

| Category | Tests | What it validates |
|----------|-------|-------------------|
| Pattern detection | 6 | `warning` fires on "mistake"/"never"; `key_idea` fires on "the most important"; `framework` fires on "formula"/"step"; all from realistic STT transcript with no punctuation |
| Multi-chunk accumulation | 2 | Moments build as video progresses; 8-chunk session produces ≥3 distinct moment types |
| Section population (single-layer) | 4 | Local moments produce entries in `entries` array (not sections); sections empty pre-AI-pass; single AI note → sections.keyIdeas has exactly that AI note with no local bleed-through |
| Note quality | 3 | No action-first card text in any entry; transcript-like ratio ≤40%; warning entries (local pipeline) are interpretive not raw copy |
| AI notes pipeline | 7 | AI notes passed to `buildListenLiveNotes`; single-layer: only AI notes in sections; `model` field preserved; `anchor`/`why` passed to renderer; transcript-copy patterns (`The speaker said…`) correctly filtered; 15s/150-char gate constants correct; gate fires at right time |
| Ask prompt | 5 | Uses anchor when ≥10 chars; falls back to note text; strips `(developing)`, `Developing idea:`, `Framework:` prefixes; inner quotes escaped |
| Visual state readiness | 3 | All required renderer fields present after full session; `latestInsight` set after multiple mature notes; `currentTopic` reflects Napoleon Hill content |
| Session lifecycle | 2 | Entries persist after `listeningStatus=idle`; AI refresh gate (15s) not due prematurely |
| AI JSON validation | 3 | Valid JSON round-trip; markdown fences stripped; garbage response falls back gracefully with no crash |
| Source filtering | 2 | All 8 Napoleon Hill events extracted; mic-tagged events excluded |
| Ad suppression | 12 | Classifier fires on real ad/sponsor phrases; content passes through; Fix 2 gates moment detection on ad text; Fix 3 gates AI refresh during ad segments |

---

## Manual Dev Testing Fixes (v0.1.16) — Live Translate Overhaul

| # | What was broken | What was fixed | Files changed |
|---|-----------------|----------------|---------------|
| 36 | **DEEPGRAM_API_KEY not loading** — `loadGlassEnv` stopped at the first `.env` found (repo root), never reading `desktop-glass/.env` where the key lives | Rewritten to load BOTH files: `desktop-glass/.env` first (priority), `../.env` as fallback; neither file clobbers keys already set | `src/main/loadGlassEnv.ts` |
| 37 | **Translate pill still showing** — timer + Stop button pill rendered beside command bar even after removal was attempted in prior session (changes never saved to disk) | Removed `showTranslatePill`, entire translate pill JSX block (timer + Stop button), and fixed HUD condition | `src/renderer/command/CommandBar.tsx` |
| 38 | **TS2448 block-scoped variable used before declaration** — `translateActive` and `translateRuntime` used at line 70, declared at line 88 | Moved declarations above first use | `src/renderer/command/CommandBar.tsx` |
| 39 | **Error cards during translate** — "System audio captured audio but transcription failed" and "Audio capture did not start" cards showed while translate was active | `setLastError` suppresses all non-hard STT errors when translate active; `listeningDesynced` suppressed entirely when `translateActive` (not just during 30s grace) | `src/main/index.ts`, `src/renderer/command/CommandBar.tsx` |
| 40 | **"Listening for audio…" placeholder box** — `TRANSLATE_WAITING_CAPTION` injected into captions on translate-start before Deepgram connected, showing an empty box | Removed `TRANSLATE_WAITING_CAPTION` injection entirely; caption area stays empty until real transcript arrives | `src/main/index.ts` |
| 41 | **Deepgram model upgraded** — nova-2 was slower and less accurate than available nova-3 | Upgraded `model: "nova-2"` → `"nova-3"` | `src/main/deepgramStreamingSTT.ts` |
| 42 | **512-byte audio silence filter blocking Deepgram VAD** — filter dropped silence chunks that Deepgram needs for voice activity detection | Moved filter to after the Deepgram branch; Deepgram receives all chunks (including silence); Whisper/server STT path keeps the filter | `src/renderer/useTranscription.ts` |
| 43 | **Audio chunks batched too slowly** — 250ms MediaRecorder timeslice delayed interim word display | Reduced timeslice `250ms` → `100ms` for near-real-time interim word display | `src/renderer/useTranscription.ts` |
| 44 | **Translation latency ~400–800ms** — GPT-based translation via IIVO server too slow for meeting use case | Added DeepL client (`translateViaDeepL`) as first-choice translation backend (~50–150ms); falls back to IIVO server if `DEEPL_API_KEY` not set | `src/main/deepLTranslate.ts` (new), `src/main/liveTranslateMain.ts` |
| 45 | **DEEPL_API_KEY placeholder missing from .env** — no entry in `desktop-glass/.env` to remind developers to add key | Added `DEEPL_API_KEY=` placeholder with comment explaining free vs paid endpoint detection (`:fx` suffix = free tier) | `desktop-glass/.env` |
| 46 | **3-word translate chunks** — `endpointing: "300"` fired speech_final too aggressively on natural mid-sentence pauses; `MIN_FLUSH_WORDS` too low | `endpointing: "250"` (fast response); `MIN_FLUSH_WORDS = 1` (flush immediately — display now accumulates, not the buffer); `utterance_end_ms: "1500"` backstop | `src/main/deepgramStreamingSTT.ts` |
| 47 | **Caption replaces instead of builds** — each translated chunk replaced `current` caption; 2-word chunks flashed and were overwritten, never accumulating into readable sentences | Added `sentenceId` to `DeepgramTranscript` and `LiveTranslateCaptionLine`; `applyCaptionChunk` appends translated text when `sentenceId` matches current line; `sentenceSeq` increments on `UtteranceEnd` so each new utterance starts a fresh caption line — YouTube-style sentence build-up | `src/main/deepgramStreamingSTT.ts`, `src/shared/liveTranslateTypes.ts`, `src/shared/liveTranslateCaptions.ts`, `src/main/liveTranslateMain.ts`, `src/main/index.ts` |
| 48 | **Deepgram connection error — no recovery** — transient WebSocket failures surfaced as permanent error cards with no retry | Auto-retry on connect failure: up to 2 retries, 1.5s apart; only shows error card if all 3 attempts fail | `src/main/index.ts` |
| 49 | **Raw source-language words flashing before translation** — interim preview showed source language (e.g. English) that then flipped to translated language, looking jarring | Interim preview now only shown when `sourceLanguage === targetLanguage` (same-language captioning); hidden for cross-language translate to avoid visual flip | `src/main/index.ts` |
| 50 | **Same-language captioning had unnecessary translation hop** — watching English video with translate set to English→English still went through DeepL | `isAlreadyTargetLanguage` path already existed; combined with fix #49, setting source=target in translate config gives instant captions with no translation latency | `src/main/liveTranslateMain.ts` (pre-existing path, now documented) |

---

## Architecture: Live Translate with Deepgram Nova-3 + DeepL

```
MediaRecorder (100ms timeslice)
  └─► IPC: sendDeepgramAudioChunk
        └─► DeepgramStreamingSession.sendAudio()
              └─► Deepgram WebSocket (Nova-3)
                    ├─► interim result → pushInterimCaptionPreview (same-lang only)
                    └─► is_final + speech_final → flushBuffer(sentenceId)
                          └─► ingestTranslateChunk(text, { sentenceId })
                                ├─► DeepL API (~50–150ms)  ← if DEEPL_API_KEY set
                                └─► IIVO server /translate  ← fallback
                                      └─► applyCaptionChunk (append if same sentenceId)
                                            └─► push() → renderer → caption overlay
```

**Sentence accumulation model:**
- Each `speech_final` flush from Deepgram carries a stable `sentenceId`
- `sentenceId` resets on `UtteranceEnd` (2s silence = speaker genuinely stopped)
- `applyCaptionChunk` appends translated chunks with the same `sentenceId` to the current caption line
- On new `sentenceId`, previous line commits to history and a fresh line starts
- Result: caption line builds up word-by-word as speaker talks, then rolls on sentence boundary

**Latency budget (cross-language translation):**
| Step | Time |
|------|------|
| Deepgram endpointing (phrase end detection) | ~250ms |
| Deepgram → DeepL round trip | ~100ms |
| IPC + render | ~16ms |
| **Total** | **~370ms behind speaker** |

**For same-language captioning** (source == target): set both to same language in translate settings → `isAlreadyTargetLanguage` skips DeepL entirely → ~200ms total (Deepgram only).

---

## Key files changed (v0.1.16)

| File | Change |
|------|--------|
| `src/main/loadGlassEnv.ts` | Load both `desktop-glass/.env` and `../.env` |
| `src/main/deepgramStreamingSTT.ts` | Nova-3, sentenceId tracking, MIN_FLUSH_WORDS=1, endpointing 250ms |
| `src/main/deepLTranslate.ts` | **New** — DeepL translation client, language mapping, free/paid detection |
| `src/main/liveTranslateMain.ts` | DeepL-first with server fallback; sentenceId threading |
| `src/main/index.ts` | Error suppression, retry logic, sentenceId threading, interim preview guard |
| `src/renderer/command/CommandBar.tsx` | Translate pill removed, TS2448 fix |
| `src/renderer/useTranscription.ts` | 100ms timeslice, silence filter after Deepgram branch |
| `src/shared/liveTranslateTypes.ts` | `sentenceId` on `LiveTranslateCaptionLine` |
| `src/shared/liveTranslateCaptions.ts` | Sentence-accumulation append logic in `applyCaptionChunk` |
| `desktop-glass/.env` | `DEEPL_API_KEY=` placeholder added |

---

## §10 Live Notes — Lever 1: AI-Quality Note Upgrade (v0.1.16)

**Goal:** Produce genuinely interpretive notes (not just regex pattern matches) using GPT-5.5 via the IIVO server. Single-layer design: GPT-5.5 is the sole visible note author — local regex patterns feed `latestInsight` gold banner and AI prompt context but never appear in the sections panel.

### New files

| File | Role |
|------|------|
| `src/main/listenNotesAiRefresh.ts` | AI background pass — calls `askIivoGlass`, parses JSON, returns `ListenAiNote[]` |
| (modified) `src/shared/listenLiveNotes.ts` | Added `ListenAiNote` interface, `aiNotes` / `lastAiRefreshMs` / `aiNotesCount` to input/state; `buildSections` puts AI notes first |
| (modified) `src/main/index.ts` | Module-level `listenAiNotes[]`, gate constants, fire-and-forget AI refresh in `refreshStreamingListenNotes`, reset on listen stop |

### How it works

```
refreshStreamingListenNotes (every 5s)
  └─► local regex pass (instant, offline) → moments → entries + meaningNotes
  │     (feeds latestInsight gold banner and AI prompt context — NOT visible sections)
  └─► AI gate: 15s elapsed AND ≥150 new chars?
        └─► refreshListenNotesWithAI (fire-and-forget)
              └─► /api/glass/ask (GPT-5.5)
                    └─► parseAiNotesResponse → ListenAiNote[]
                          └─► listenAiNotes = result.notes
                                └─► push() → buildListenLiveNotes
                                      └─► buildSections: AI notes ONLY
                                            (sections empty until first AI pass ~15s)
```

### Quality comparison

| | Before | After (single-layer AI) |
|-|--------|-------------------------|
| Note style | Template regex notes | Interpretive: genuine reasoning about what speaker is arguing |
| Visible notes | Local regex notes immediately | Nothing in sections until ~15s AI pass |
| Warmup signal | Regex notes in panel | `latestInsight` gold banner from local moments |
| Latency | Instant (offline) | ~15s to first visible note, then every 15s |
| Fallback | Always available | No panel notes until server responds; gold banner still fires |
| Model | N/A | GPT-5.5 (April 2026 flagship) |

### Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `LIVE_NOTES_AI_REFRESH_MS` | 15,000 ms | Minimum gap between AI refreshes (reduced from 35s) |
| `LIVE_NOTES_AI_MIN_DELTA_CHARS` | 150 chars | Minimum new transcript before triggering AI pass (reduced from 300) |

---

## ⚠️ Pre-Launch Checklist — Must Complete Before Public Release

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Fill in blanks in `docs/TERMS_OF_SERVICE_DRAFT.md`: governing state, legal email address, website URL | Chris | ⏳ Pending |
| 2 | Fill in blanks in `docs/PRIVACY_POLICY_DRAFT.md`: privacy email, website URL, DPA contact | Chris | ⏳ Pending |
| 3 | Have a startup/tech attorney review both documents — 1 hr review, ~$300–500 | Chris | ⏳ Pending |
| 4 | Finalize governing state and arbitration clause in TOS §14 | Chris + Attorney | ⏳ Pending |
| 5 | Wire `/terms` and `/privacy` routes into web app (agent task P2-9) | Agent | ⏳ Pending |
| 6 | Add TOS acceptance checkbox to onboarding flow | Agent | ⏳ Pending |
| 7 | Notarize and sign the macOS app (`npm run release:mac`) | Chris | ⏳ Pending |
| 8 | Replace placeholder contact emails in TOS/Privacy with real addresses | Chris | ⏳ Pending |
| 9 | IIVO Lens extension published to Chrome Web Store (or document it's developer-only) | Chris | ⏳ Pending |
| 10 | Verify Deepgram + OpenAI Data Processing Agreements are in place | Chris | ⏳ Pending |

---

## Known limitations / future work

| Item | Notes |
|------|-------|
| **Cross-language ~370ms lag** | Inherent to translate pipeline; DeepL is already fastest available (~100ms). Cannot match same-language STT (0ms translation step). |
| **Caption quality at fast speech** | With `endpointing: 250ms`, rapid speech may produce more frequent but smaller chunks. Tune `endpointing` up if chunks feel fragmented. |
| **`IIVO_GLASS_OPENAI_API_KEY` empty** | Listen mode direct STT path will fail without this key. Translate uses Deepgram and is unaffected. |
| **No E2E coverage for Deepgram/DeepL path** | Requires live audio + real API keys. Manual testing only. |
| **No E2E coverage for AI notes path** | `refreshListenNotesWithAI` requires a live IIVO server + valid auth. Integration tested manually only. Unit: parse logic is pure and tested inline. |
| **Live Notes fully shipped** | All three levers complete — AI quality pass, visual redesign, interactive Ask button. |
| **Speaker diarization — quick version (TODO)** | Deepgram Nova-3 supports diarization natively (`diarize: true`). Quick version: parse `words[].speaker` integer from Deepgram response, prefix each transcript chunk with `[S0]`/`[S1]` tags in the rolling transcript. The GPT-5.5 AI pass picks up the tags and naturally attributes notes per speaker. Estimated effort: ~1 day. Files: `deepgramStreamingSTT.ts` (enable flag + word-level parse), `DeepgramTranscript` type (add `speakerId?`), `applyListenTranscriptFragment` (thread through), `buildAiNotesPrompt` (instruct model to attribute by speaker tag). |
| **Speaker diarization — full version (TODO, worth doing for interview content)** | Build on quick version to add: (1) named speaker resolution — extract guest name from `mediaContext.title` (e.g. "Aaron Levy" from "$4B Founder") and map `speaker: 1` → "Aaron Levy", `speaker: 0` → "Host"; (2) `speakerId` field on `ListenMoment` so notes are tagged; (3) speaker-separated note sections in the Live Notes panel (guest insights vs host questions); (4) optional onboarding prompt when 2+ speakers detected ("Who are the speakers?"); (5) suppress moments from the interviewer's questions — insights come from the guest, not "tell me about your journey" prompts. High-value for interview/podcast content. Estimated effort: 3–4 days. Particularly impactful for 2-person interviews like Silicon Valley Girl + Aaron Levy where the guest is the insight source. |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-09 | v0.1.16 baseline: Deepgram Nova-3 + DeepL translate overhaul; fixes #36–#50 documented |
| 2026-06-09 | §10 Live Notes E2E: 28 new tests added (`src/test/liveNotesE2e.test.ts`); all 28 passing; closes #1 priority gap from contract |
| 2026-06-09 | §10 Live Notes Lever 1: AI-quality note upgrade via GPT-5.5 background pass; new `src/main/listenNotesAiRefresh.ts`; `ListenAiNote` type + `aiNotes` wired into shared pipeline; fire-and-forget gate in `refreshStreamingListenNotes`; 28 tests still passing |
| 2026-06-09 | §10 Live Notes Lever 2: Visual redesign — `NoteCard` component (anchor quote, why text, AI ✦ badge), section icons (💡⚙️📖⚠️⚡❓💬), `InsightBanner` (gold, uses `latestInsight`), `EnrichedNoteSection` (AI notes → meaning notes → fallback strings), `live-notes__pill--ai` status chip; 90+ new CSS rules in `glass.css`; 28 tests still passing |
| 2026-06-09 | §10 Live Notes Lever 3: Interactive notes — `Ask ↗` button per `NoteCard` calls `send({ type: "prefill-command-bar", text })` → main routes `prefillCommandBar()` → `glass:command-bar-prefill` IPC → `CommandBar.tsx` sets input + focuses; `buildAskPrompt` builds context-aware question from anchor or note text; 6 files changed; 28 tests still passing |
| 2026-06-09 | §10 Live Notes User Journey: 39 end-to-end journey tests added (`src/test/liveNotesUserJourney.test.ts`); simulates real user watching Napoleon Hill "Think and Grow Rich" video; covers pattern detection (warning/key_idea/claim/framework), section population, note quality (no action-first, low transcript-like ratio), AI notes pipeline (parse/filter/insert-first), `buildAskPrompt` for all prefill cases, visual state readiness, and listen-stop persistence; 39/39 passing |
| 2026-06-09 | §10 Live Notes — Ad suppression: 3 pipeline gaps plugged — (1) rolling transcript append gated behind `isNonContentSegment`; (2) `evaluateListenMoments` receives empty `newText` for ad segments; (3) `aiRefreshDue` gate blocks AI refresh when `lastSegmentKind` is `ad` or `sponsor`; `listenSegmentClassifier.ts` upgraded with `SPONSOR_TRANSCRIPT` single-signal array for strong ad phrases; 12 new `[Ad Suppression]` tests added; 51/51 journey tests passing |
| 2026-06-09 | §10 Live Notes — Speaker diarization (quick version): `diarize: true` on dedicated `listenDeepgramSession`; `dominantSpeaker()` majority-votes `words[].speaker` per sentence; `[S0]`/`[S1]` prefixes in rolling transcript; AI prompt detects speaker tags and attributes notes per speaker; full version logged as BASELINE TODO |
| 2026-06-09 | §10 Live Notes — Single-layer note display: removed local pattern layer from visible sections; `buildSections` now shows ONLY AI notes; sections empty pre-first-AI-pass (~15s); local moments still flow to `entries` + `meaningNotes` for `latestInsight` gold banner and AI prompt context; AI refresh interval dropped from 35s → 15s; min delta chars dropped from 300 → 150; 13 tests updated across 5 test files; 840/842 passing (2 pre-existing unrelated failures) |
| 2026-06-10 | Startup error fix: `hasError` in `CopilotPanel.tsx` now gated on `listening === true`; startup audio probe (`scheduleInitialSetupCheck → testSystemAudio → SET_ERROR`) no longer shows "Error" on Listen card before user interacts; 843/843 passing |
| 2026-06-10 | Insight strip fix: `meaningNoteFromStreamingSentence` confidence downgraded to always `"low"` so streaming template notes never surface in gold banner; `latestInsight` is now AI-only (undefined when no AI notes); raw transcript artifacts eliminated from insight strip; 2 tests updated; 843/843 passing |
| 2026-06-10 | Sentry disabled in dev: main process `Sentry.init` gated on `app.isPackaged`; renderer `initSentry.ts` gated on `NODE_ENV === "production"`; stops dev noise from expected errors (401s, audio probe, missing env) |
| 2026-06-10 | `loadGlassEnv.ts` empty-value skip: empty `KEY=` entries in `desktop-glass/.env` are skipped, allowing repo-root `.env` to supply real values; fixes 401 Unauthorized on AI refresh when `IIVO_GLASS_API_SECRET=` was blank |
| 2026-06-10 | Autonomous overnight agent: `scripts/glass-autonomous-agent.mjs` + `npm run agent`; runs `npm test` in a loop, invokes Claude Code CLI to fix failures, updates BASELINE after clean passes, writes `AGENT_REPORT.md` on exit; `--hours N`, `--interval N`, `--max-fixes N`, `--dry-run` flags |
| 2026-06-10 | Speaker name resolution (full diarization): `src/shared/speakerNameExtraction.ts` — pure regex engine scans rolling transcript for self-intros ("I'm Lex Fridman"), guest intros ("joined by Sam Altman"), host addresses ("Thanks Lex") and direct address ("Sam, what do you think"); returns `Record<speakerId, name>`; `listenSpeakerNames` runtime var in `index.ts` updated on every non-ad chunk; passed to `refreshListenNotesWithAI` → `buildRefreshPrompt` injects speaker mapping block ("Speaker mapping: [S0] = Lex Fridman (host), [S1] = Sam Altman (guest)") so AI notes use real names; falls back to "the host"/"the guest" when names unknown; 5/5 unit tests passing; 843/843 passing |
| 2026-06-10 | Live Notes UX fixes (3): (1) Auto-scroll — scroll listener now re-registers when notes view mounts (`[!!notes]` dep instead of `[]`); `↓ Latest` pill button appears when user has scrolled up, clicks to smooth-scroll to bottom; (2) Insight truncation — parser strips trailing `...`/`…` from AI notes; notes that end mid-sentence (no `.!?)`) discarded; prompt adds "End with a complete thought" rule; (3) Note quality — transcript window widened 800→1200 chars; count guidance changed to "2–4, prefer 2 excellent over 4 mediocre"; prompt adds "skip if transcript too thin" rule; 843/843 passing |
| 2026-06-10 | Speaker name warm-up gap fix: `extractNamesFromTitle(title)` added to `speakerNameExtraction.ts` — parses video/page title formats ("Lex Fridman Podcast #400 \| Sam Altman", "JRE #2000 - Elon Musk", "Show with Naval Ravikant", "Andrew Huberman: subtitle") to seed names before Deepgram connects; `seedSpeakerNamesFromBrowserTitle()` in `index.ts` fires osascript at listen-start (tries Chrome then Safari), merges title names into `listenSpeakerNames` without overwriting already-resolved names; `speakerNameExtraction.test.ts` added with 21 tests covering all 4 functions; 864/864 passing |
| 2026-06-10 | Legal: Terms of Service and Privacy Policy drafts written and saved to `ai-council-runner/docs/TERMS_OF_SERVICE_DRAFT.md` and `ai-council-runner/docs/PRIVACY_POLICY_DRAFT.md`; covers current features (system audio capture, AI notes, screen overlay, browser extension) and future features (meetings mode, billing/subscriptions, cloud sync, calendar integration, multi-user); key provisions: recording consent + user responsibility for all-party consent states, audio data handling (transient processing, not stored), AI output disclaimer, HIPAA exclusion, third-party disclosures (Deepgram, OpenAI, DeepL, Sentry, Stripe), CCPA + GDPR rights, limitation of liability; agent task P2-9 added to wire `/terms` and `/privacy` routes into web app with onboarding acceptance checkbox; requires attorney review before public launch |
| 2026-06-10 | Bug fixes (post overnight agent failure): AppState missing fields (`commandBarStackHeightPx`, `commandBarOverlayClearancePx`, `listenLiveNotes`) added to interface in `index.ts`; `glassLensCapture.ts` `optimizeVisualAskImage` call fixed (missing `sourceSize` arg); `liveNotesUserJourney.test.ts` literal-type comparison errors fixed; web app JSX namespace errors fixed in 6 files (`AppRouter.tsx`, `GlassDocLayout.tsx`, `GlassLandingFooter.tsx`, `GlassInstallPage.tsx`, `GlassPrivacyPage.tsx`, `GlassTermsPage.tsx`); 864/864 still passing |
| 2026-06-10 | Agent hardened — two root-cause fixes: (1) `claude` CLI path now detected at startup via `which claude` + fallback list → `CLAUDE_BIN`; all fix/task invocations use absolute path; (2) `npm test` replaced with direct `node` invocation (parsed from `package.json`) to bypass npm's stdio:inherit which was swallowing test output; (3) `runPreflight()` added — runs before main loop, verifies claude callable (`claude --version`), test output is captured (count > 0), logs all resolved paths; exits with code 1 and clear message if any critical check fails; prevents silent 8-hour loop-doing-nothing failure mode |
| 2026-06-10 | Browser extension tests: pure logic extracted from `browser-extension/popup.js` into `browser-extension/lib/popupLogic.js` (urlDomain, previewSnippet, estimateDataUrlBytes, buildScreenshotFilename, formatBytes, truncationFields, buildPageContent, buildContextPayload, buildScreenshotPayload, findRecentDuplicate); `browser-extension/tests/popup.test.js` written with 37 tests covering all extracted functions; `browser-extension/package.json` added with `npm test` script; 37/37 passing |
| 2026-06-10 | §16 Update Check E2E: `src/test/glassUpdateCheck.e2e.test.ts` — 24 tests covering semver parsing (double-digit patch), version comparison (overlay gate), initial idle state, overlay title format, download target resolution (arm64 vs Intel vs fallback), feed URL, and fetch-failure/no-false-overlay behaviour; added to `package.json` test list |
| 2026-06-10 | §18 Passive Context Engine E2E: `src/test/glassPassiveContext.e2e.test.ts` — 24 tests covering rolling log cap (50 interactions), summary rebuild cadence (every 5), dominant topic detection, topic categorisation (6 categories), keyword extraction, userContext omitted for new users, corrupt/missing profile → fresh empty profile, interaction builder fields; added to `package.json` test list; total test count: 912/912 passing |
| 2026-06-10 | Task 7 — Visual inspector: `scripts/glass-visual-inspector.mjs` rewritten to use CDP spawn approach (compatible with Electron 42); exports `runVisualInspection({ headed, noConnect })`; checks dock elements, command bar window, panel open/listen card, overlay window, error banners; saves screenshots to `/tmp/glass-visual-inspect/`; used by agent `--visual` flag |
| 2026-06-10 | Task 10 — Council web app E2E audit: `ai-council-runner/tests/e2e/council-full-audit.spec.ts` written with 27 tests covering landing page, LandingGate (bypass + lock gate), `/install`, `/privacy`, `/terms`, `/dashboard` (stub API), server health, cross-page SPA navigation, and mobile 390px layout; `playwright.config.ts` updated to include `tests/e2e/` alongside `tests/visual/`; audit report written to `ai-council-runner/docs/COUNCIL_E2E_AUDIT.md` |
| 2026-06-10 | Dock labels integrated from WIP branch: `src/renderer/dock/dockLabels.ts` created — centralises all dock button copy into typed `DOCK_LABELS` record + `DockActionKey` union + 5 helper functions (`resolvePanelLabel`, `resolveOverlayLabel`, `resolveChromeLockLabel`, `resolveDockOrientationLabel`, `resolveSendLabel`); `Dock.tsx` updated to import and use all label helpers; `dockLabels.ts` removed from git guard `WIP_ONLY_PATTERNS` (now stable); typecheck clean; 912/912 passing |
