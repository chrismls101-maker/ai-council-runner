# IIVO Glass — QA Snapshot

**Date:** 2026-06-12T23:47:02.452Z
**Node:** v26.0.0
**Duration:** 6.4s
**Result:** ✅ ALL CHECKS PASSED

---

## 1. TypeScript typecheck

✅ **tsc --noEmit**
   → 0 errors

## 2. Unit tests (node:test)

✅ **npm test (1,394 expected)**
   → ✔ extractTestsClaim returns dynamic claim when test_pass event present (0.213583ms) | ✔ extractClaims includes tests_pass when repo + test_pass event present (0.050208ms) | ℹ pass 424 | ℹ fail 0

✅ **Full suite (all test files)**
   → passed

## 3. Git hygiene

✅ **git:guard (no secrets/blocked files staged)**
   → clean

## 4. New file existence

✅ **scripts/glass-qa-wingman-full.mjs**
   → exists

✅ **scripts/glass-qa-agent-proxy-live.mjs**
   → exists

✅ **tests/e2e/glass-wingman-ui.spec.ts**
   → exists

✅ **tests/e2e/glass-meeting-intel.spec.ts**
   → exists

✅ **tests/MANUAL_QA_v0.5.0.md**
   → exists

✅ **tests/BASELINE_v0.5.0.md**
   → exists

## 5. IPC command name spot-checks

✅ **ipc.ts contains "wingman-debug-inject-inspection"**
   → found

✅ **ipc.ts contains "wingman-debug-set-token-invalid"**
   → found

✅ **ipc.ts contains "wingman-debug-get-session"**
   → found

✅ **ipc.ts contains "wingman-debug-clear-state"**
   → found

✅ **ipc.ts contains "wingman-github-pat-status"**
   → found

✅ **ipc.ts contains "wingman-github-pat-save"**
   → found

✅ **ipc.ts contains "wingman-github-pat-clear"**
   → found

✅ **ipc.ts contains "meeting-delete-moment"**
   → found

✅ **ipc.ts contains "meeting-add-moment"**
   → found

✅ **ipc.ts contains "meeting-set-type"**
   → found

✅ **ipc.ts contains "wingman-agent-proxy-consent-grant"**
   → found

## 6. GlassState field name checks

✅ **GlassState has "githubPATConfigured"**
   → found

✅ **GlassState has "githubTokenInvalid"**
   → found

✅ **GlassState has "wingman:"**
   → found

✅ **GlassState has "wingmanMemory:"**
   → found

✅ **GlassState has "agentProxy:"**
   → found

✅ **GlassState has "meetingIntelligence?:"**
   → found

## 7. data-testid coverage in WingmanPanel.tsx

✅ **data-testid="wingman-github-pat-section"**
   → found

✅ **data-testid="wingman-github-pat-connect-btn"**
   → found

✅ **data-testid="wingman-github-pat-cancel-btn"**
   → found

✅ **data-testid="wingman-github-pat-save-btn"**
   → found

✅ **data-testid="wingman-github-pat-input"**
   → found

✅ **data-testid="wingman-github-pat-status-connected"**
   → found

✅ **data-testid="wingman-github-pat-status-saved"**
   → found

✅ **data-testid="wingman-github-pat-status-invalid"**
   → found

✅ **data-testid="wingman-github-pat-update-btn"**
   → found

✅ **data-testid="wingman-github-pat-remove-btn"**
   → found

✅ **data-testid="wingman-github-pat-confirm-remove-btn"**
   → found

✅ **data-testid="wingman-github-pat-cancel-remove-btn"**
   → found

✅ **data-testid="wingman-github-pat-warn-banner"**
   → found

✅ **data-testid="wingman-github-pat-inline-reopen-btn"**
   → found

---

## How to run live QA (needs Glass running)

```bash
# Terminal 1 — start Glass
cd desktop-glass && npm run dev

# Terminal 2 — run full QA once Glass is up
GLASS_API_SECRET=<your-secret> node scripts/glass-qa-wingman-full.mjs

# With backdoors (loop detection, token-invalid state):
IIVO_GLASS_TEST=1 npm run dev   # restart Glass with this flag
GLASS_API_SECRET=<your-secret> npm run qa:wingman:full:backdoors
```

## ✅ Everything passed

All offline checks are green. To run live Glass QA, see the section above.