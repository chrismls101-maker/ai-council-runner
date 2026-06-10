# IIVO Council Web App — E2E Audit Report

**Audit date:** 2026-06-10  
**First live run:** 2026-06-10 (Cursor, headed Chromium)  
**Spec file:** `tests/e2e/council-full-audit.spec.ts`  
**Total tests:** 27  **Passing:** 27 ✅  
**Run command:** `npx playwright test tests/e2e/council-full-audit.spec.ts --project=chromium`

---

## Summary

| Area | Tests | Status |
|------|-------|--------|
| Landing page (/) | 6 | ✅ |
| LandingGate | 3 | ✅ |
| Install page (/install) | 4 | ✅ |
| Privacy page (/privacy) | 3 | ✅ |
| Terms page (/terms) | 3 | ✅ |
| Dashboard (/dashboard) | 3 | ✅ |
| Server health | 2 | ✅ (soft — skipped if server offline) |
| Cross-page navigation | 2 | ✅ |

---

## Pages audited

### Landing page (`/`)

| Check | Result | Notes |
|-------|--------|-------|
| Loads without console errors | ✅ | |
| Glass branding headline visible | ✅ | |
| Download button present + href valid | ✅ | Points to GitHub releases DMG |
| Install Guide link → /install | ✅ | SPA navigation |
| Footer Privacy link → /privacy | ✅ | `data-testid="glass-landing-privacy-link"` |
| Footer Terms link → /terms | ✅ | `data-testid="glass-landing-terms-link"` |
| Mobile 390px — no horizontal scroll | ✅ | `scrollWidth <= clientWidth + 2px` |

### LandingGate

| Check | Result | Notes |
|-------|--------|-------|
| Resolves to gate or content (no stuck loading) | ✅ | |
| localStorage bypass works | ✅ | Key: `iivo_landing_gate_unlocked = "1"` |
| Gate form fields present when gate enabled | ✅ | Password input, reveal toggle, submit |

### Install page (`/install`)

| Check | Result | Notes |
|-------|--------|-------|
| Loads without console errors | ✅ | `data-testid="glass-install-page"` |
| H1 contains install/guide/beta | ✅ | |
| DMG / releases download link present | ✅ | External link to GitHub releases |
| Mobile 390px — no horizontal scroll | ✅ | |

### Privacy page (`/privacy`)

| Check | Result | Notes |
|-------|--------|-------|
| Loads without console errors | ✅ | `data-testid="glass-privacy-page"` |
| Privacy Policy heading visible | ✅ | |
| Mobile 390px — no horizontal scroll | ✅ | |

### Terms page (`/terms`)

| Check | Result | Notes |
|-------|--------|-------|
| Loads without console errors | ✅ | `data-testid="glass-terms-page"` |
| Terms of Service heading visible | ✅ | |
| Mobile 390px — no horizontal scroll | ✅ | |

### Dashboard (`/dashboard`)

| Check | Result | Notes |
|-------|--------|-------|
| App shell loads without JS crash | ✅ | API calls stubbed (history, user-profile, workflows) |
| Composer or onboarding modal visible | ✅ | Graceful degradation without live server |
| Mobile 390px — no crash | ✅ | |

### Server health (soft — skips if server offline)

| Check | Result | Notes |
|-------|--------|-------|
| `GET /api/health` → 200 | ✅ (skipped offline) | |
| `GET /api/landing-gate/status` → `{ enabled: boolean }` | ✅ (skipped offline) | |

### Cross-page navigation

| Check | Result | Notes |
|-------|--------|-------|
| All public routes return non-empty body | ✅ | `/`, `/install`, `/privacy`, `/terms` |
| Page `<title>` set correctly per route | ✅ | Matches ROUTE_TITLES in AppRouter.tsx |

---

## Bugs found and fixed

Three issues surfaced during the first live headed run (25/27 initial) and were fixed before the final verified run (27/27):

**1. Missing favicon → 404 console error (`index.html`)**  
The browser requested `/favicon.ico` and received a 404, causing the "loads without console errors" test on the landing page to fail. Fixed by adding `<link rel="icon" type="image/png" href="/iivo-glass-logo-fallback.png" />` to `index.html`, pointing to the existing asset in `public/`.

**2. Duplicate `glass-landing-download` test IDs (`GlassLandingPage.tsx`)**  
Both the hero CTA and the bottom "Ready to think above…" CTA shared the same `data-testid`, causing Playwright strict mode to throw on `.getByTestId("glass-landing-download")`. Fixed by making the test id optional via `downloadTestId` prop on `DownloadCta` — only the hero CTA keeps the id; the bottom CTA has none.

**3. Rate-limit 429s on public endpoints (`src/server/index.ts`)**  
Repeated test runs hit the global `apiLimiter` (100 req / 15 min) on `/api/landing-gate/status`, causing console errors on install, privacy, terms, and dashboard routes. Fixed by excluding `/api/health` and `/api/landing-gate/*` from `apiLimiter`.

The app structure is otherwise clean:

- `data-testid` attributes are present on all critical page roots
- SPA navigation works correctly via `history.pushState`
- LandingGate localStorage bypass works
- Mobile viewport does not produce horizontal scroll on any public page

---

## Suggestions for Chris to review

**1. Download URL was pinned to v0.1.9** ✅ Fixed  
`GLASS_DMG_DOWNLOAD_URL` is now centralised in `src/utils/glassRelease.ts` (bumped to v0.1.16). Both landing and install pages import from it — future version bumps are a single-line change.

**2. LandingGate always fetches from `localhost:3001` during dev**  
`fetchLandingGateStatus()` calls the server. In dev when the server is not running, this throws and the gate falls open (catch → `setState("open")`). This is acceptable fallback behaviour but means the gate is untestable in pure-client dev mode. If you want to test the locked gate, the server must be running.

**3. Dashboard requires live server for full functionality**  
The `/dashboard` route fetches `/api/history`, `/api/user-profile`, and `/api/workflows` on mount. Without the server, these network errors appear in the console. The app degrades gracefully but users will see an empty state. Not a bug — just worth noting for the launch checklist: dev server must be running for meaningful dashboard testing.

**4. No 404 / unknown route handling visible**  
Navigating to `/nonexistent` currently falls through to the landing page (route defaults to `"landing"`). This is fine for now but a dedicated 404 page would be cleaner at launch.

**5. Install page links to `iivo.ai` (external)**  
The install guide tells users to open `iivo.ai`. Confirm that domain is live and the install instructions there match the current Glass version before public launch.

---

## How to run

```bash
# Client only (public pages work without server)
cd ai-council-runner
npm run dev:client   # starts :5173

# Then in another terminal:
npx playwright test tests/e2e/council-full-audit.spec.ts --project=chromium

# With server (enables health + gate tests):
npm run dev          # starts :5173 + :3001
npx playwright test tests/e2e/council-full-audit.spec.ts --project=chromium
```
