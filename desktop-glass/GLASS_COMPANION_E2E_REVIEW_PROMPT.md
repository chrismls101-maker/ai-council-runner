# Glass Companion (Aletheia) — End-to-End Review Prompt

**Copy everything below the line into a new Cursor chat to run a full Aletheia / Companion audit.**

---

## PROMPT START (copy from here)

You are auditing **Aletheia** (Glass Companion) in the IIVO Glass Electron app (`desktop-glass/`). The feature is **Phases 1–4 + Aletheia identity layer** (session prompt, warm-up TTS, dual hearing, Response Panel depth). Your job is to verify it works **end-to-end with no errors, bugs, or regressions** — fix anything broken, run all automated tests, and produce a pass/fail report with evidence.

### Repo

- Root: `ai-council-runner`
- Glass app: `desktop-glass/`
- IIVO server: repo root (typically `npm run dev` on port 3001)

### What Aletheia is

A **strip toggle** labeled **Aletheia** (not hold-to-talk) that keeps a session open: listen → route → ask → **Matilda TTS** (Aletheia identity) + **spatial overlay manifestations** + optional **Glass Response Panel** for depth. Optional **OmniParser sidecar** adds `som-*` UI marks when AX/DOM are sparse. **Dual hearing:** mic (user commands) + parallel machine-audio transcript (listen-only context when BlackHole/Loopback configured).

**Read first:**
- `desktop-glass/GLASS_COMPANION.md` — master spec (**Aletheia — identity, hearing & depth** section)
- `desktop-glass/GLASS_COMPANION_PHASE4.md` — Phase 4 detail
- `desktop-glass/GLASS_COMPANION_OMNIPARSER.md` — sidecar + Installations flow
- `GLASS_CONTRACT.md` §21 Glass Companion (Aletheia)
- `src/server/glass/glassCompanionGuidance.ts` — `GLASS_COMPANION_SESSION_APPEND`

---

### Architecture (verify wiring intact)

```
Builder strip toggle (companionModeActive)
  → GlassCompanionProvider (overlay) — listen loop, TTS, presence
  → submit-command (main) — capture, UiMap, companionRoute, companionMemory
  → /api/glass/ask (server) — companionMode, companionUiMap, guidancePlan JSON
  → companionPresence on GlassState → GlassCompanionPresence overlay
```

**Phase 4 additions:**
- **4a** Retarget: `companionSessionMemory` + `companionRetarget` → `companionRoute: retarget` → reuse capture <15s → `glassCompanionRetarget.ts` partial replan
- **4b** Scripts: `guidancePlan.steps[]` → `useCompanionScriptPlayer` → ack phrases via `companionScriptBridge`
- **4c** Rich primitives: `MagnifierLens`, `SketchLayer`, `ArrowLayer`, `PathAnimation` + `companionCaptureCrops`
- **4d.1** Anchor: `companionAnchorWatch` clears presence on window drift
- **4d.2/3** OmniParser: `companionOmniParser.ts` + `omniparser-sidecar/` — auto-enable when weights installed; warm on Companion toggle; **Panel → Installations** install flow

---

### Prerequisites for live testing

| Requirement | Notes |
|-------------|-------|
| IIVO server running | `IIVO_API_URL` (default `http://localhost:3001`) |
| Glass dev | `cd desktop-glass && npm run dev` |
| `ELEVENLABS_API_KEY` | Required for timed TTS + segment-synced presence |
| macOS Accessibility | For AX marks on native apps |
| Screen Recording | For visual capture |
| Mic / STT | Deepgram or configured STT |
| System audio (optional) | BlackHole/Loopback via Panel → Installations → System Audio |

**OmniParser (optional):**
- Weights: `desktop-glass/omniparser-sidecar/models/icon_detect/model.pt`
- Install via Panel → **Installations** → Install OmniParser (terminal + Enter)
- Or: `cd desktop-glass/omniparser-sidecar && ./install-models.sh`
- Verify: `./verify.sh`
- Auto-enables when weights present (no `.env` unless disabling: `IIVO_COMPANION_OMNI_PARSER=0`)

---

### Step 1 — Automated tests (run all, fix failures)

```bash
cd desktop-glass

# Typecheck
npm run typecheck

# All Companion unit tests
node --experimental-strip-types --test \
  src/test/glassCompanion.test.ts \
  src/test/companionGuidance.test.ts \
  src/test/companionPhase25And3.test.ts \
  src/test/companionPhase4a.test.ts \
  src/test/companionPhase4bcd.test.ts \
  src/test/companionOmniParser.test.ts

# OmniParser sidecar Python tests + smoke
cd omniparser-sidecar && source .venv/bin/activate
python -m unittest test_parser.py -v
./verify.sh
cd ..
```

**Expected:** all tests pass, typecheck clean, `verify.sh` prints `✓ All checks passed`.

---

### Step 2 — Code audit checklist

Verify these integration points exist and are consistent:

| Area | Files to inspect | What to verify |
|------|------------------|----------------|
| Toggle | `index.ts` `toggle-companion-mode`, `BuilderStrip.tsx` | Aletheia label; ON warms OmniParser + warm-up TTS; OFF clears presence + memory |
| Dual hearing | `useTranscription.ts` `startCompanionListening` | Mic auto-submit; system audio silent context only |
| Session prompt | `glassCompanionGuidance.ts` | `GLASS_COMPANION_SESSION_APPEND` on all companion asks |
| Response Panel | `index.ts` `companionPrefersResponsePanel`, `Overlay.tsx` | Depth asks open panel + short speech |
| Visual ask | `index.ts` submit-command companion branch | `buildCompanionLocalUiMap`, `tryOmniParserMarks`, merge, `companionCaptureCrops` |
| Server ask | `glassAskTypes.ts`, server companion handler | `companionMode`, `companionUiMap`, `companionMemory`, `companionRoute` forwarded |
| Parse | `companionGuidance.ts`, server mirror | ` ```companion` JSON fence → GuidancePlan with steps + rich manifestations |
| Presence | `GlassCompanionPresence.tsx`, `companionPresenceEngine.ts` | Segment sync, script player, primitive renderers |
| Retarget | `companionRetarget.ts`, `glassCompanionRetarget.ts` | "that one" routes without full recapture when <15s |
| Scripts | `companionScriptEngine.ts`, `useCompanionScriptPlayer.ts` | Multi-step, crossfade, "next"/"okay" ack |
| Anchor | `companionAnchorWatch.ts` | Window move clears presence |
| OmniParser | `companionOmniParser.ts`, `omniparser-sidecar/server.py` | Health, parse, auto-spawn, Installations tab |
| Installations | `InstallationsTab.tsx`, `run-omniparser-install` | Panel closes, terminal opens, Enter confirms install |

**Look for:** stale docs saying "stub only", wrong env defaults, race conditions on cold OmniParser load (>2s first parse), missing error handling (sidecar down → `[]` marks, no crash).

---

### Step 3 — Manual E2E test script

Run each scenario. Mark PASS/FAIL. Fix failures before signing off.

#### Core (Phase 1 + Aletheia)
1. **Toggle ON** — strip shows `Aletheia · Listening` (or warm-up lines on OmniParser cold start)
2. **Direct ask** — "What is TypeScript?" → Matilda speaks (Aletheia persona)
3. **Visual ask** — "What's on my screen?" → Looking cue → capture → spoken answer
4. **Depth ask** — "Generate a project plan for my app" → Response Panel opens + short spoken summary
5. **Listen-in ack** — "Listen in on this video, I'll pause if I have questions" → one-sentence ack only, then silent
6. **Machine audio** (if configured) — play video → strip shows `+ audio` → **no unprompted speech** → pause, ask on mic → answer uses context
7. **Toggle OFF** — mic stops, presence clears
8. **Stop Everything** — Aletheia off

#### Presence (Phases 2–3)
6. Visual ask with Companion → **glow/spotlight** on a UI region
7. Multi-segment speech → highlight **changes mid-speech** (needs timed TTS)
8. Model requests trace/cursor → renders correctly

#### UiMap (Phase 2.5)
9. Native app frontmost → **ax-* marks** in guidance (Accessibility granted)
10. Chrome frontmost → **dom-* marks**
11. Vision fallback → **m1, m2** marks when local parse sparse

#### Phase 4a — Retarget
12. Visual ask → glow on region A
13. Say **"that one"** or **"no, the other one"** pointing at B → **crossfade to B** without full re-capture (same app, <15s)

#### Phase 4b — Scripts
14. "Walk me through this form/screen" → **≥3 steps**, crossfade between steps
15. On ack step, say **"next"** or **"okay"** → advances
16. Strip status shows **Step N of M**

#### Phase 4c — Rich primitives
17. Tiny text on screen → **magnifier** lens with zoomed crop
18. Model returns sketch/path → **SketchLayer** / **PathAnimation** visible
19. Arrow between two marks → **ArrowLayer** draws in

#### Phase 4d — Anchor + OmniParser
20. Mid-guidance, **move front window** → highlights clear (anchor invalidate)
21. Non-Chrome app with sparse AX → OmniParser adds **som-* marks** (if installed)
22. `curl -s http://127.0.0.1:8765/health` → `modelLoaded:true`, `mode:yolo` after ~30s warm
23. **Panel → Installations** → status "Installed — active with Companion" (if weights present)

#### Failure modes (must not crash Glass)
24. OmniParser sidecar **not running** → visual ask still works (AX/DOM/vision only)
25. Sidecar **timeout** → empty som marks, no main-thread hang
26. Missing **ELEVENLABS_API_KEY** → falls back to untimed TTS (degraded but functional)
27. Companion OFF during script → player stops cleanly

---

### Step 4 — Success criteria (all must pass)

- [ ] `npm run typecheck` — zero errors
- [ ] All 6 Companion test files pass
- [ ] `omniparser-sidecar/verify.sh` passes (if weights installed)
- [ ] Manual scenarios 1–5 (core) — PASS
- [ ] At least one presence scenario (6–8) — PASS
- [ ] At least one Phase 4 scenario (12–16 or 20–23) — PASS
- [ ] Failure modes 24–25 — PASS (graceful degradation)
- [ ] No console errors in main/renderer during a full Companion session
- [ ] Docs match behavior (`GLASS_COMPANION.md`, `GLASS_COMPANION_OMNIPARSER.md`)

---

### Step 5 — Deliverable format

When done, report:

```markdown
## Glass Companion (Aletheia) E2E Review — [DATE]

### Automated
- typecheck: PASS/FAIL
- unit tests: N/N pass
- sidecar verify: PASS/FAIL/SKIP

### Manual
| # | Scenario | Result | Notes |
|---|----------|--------|-------|

### Bugs found & fixed
- [file] description → fix

### Open issues (if any)
- ...

### Sign-off
READY / NOT READY for production
```

Fix all bugs you find. Do not mark READY with failing tests or known crashes.

## PROMPT END
