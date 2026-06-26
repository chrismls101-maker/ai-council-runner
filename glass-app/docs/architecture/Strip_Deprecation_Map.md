# Strip Deprecation Map — `glass.strip.minimalPublic`

**Sprint:** Layer 3 (Code Migration & Product Surface Changes)  
**Status:** Active  
**Last updated:** 2026-06-26

This document maps every Builder Strip item affected by the `minimalPublic` migration. It exists so reviewers, QA, and operators can see **what moved**, **what is flag-gated**, and **how to reverse** a change without reading the diff.

---

## Architecture law (non-negotiable)

| Rule | Meaning |
|------|---------|
| **Flag-first migration** | Strip shortcuts are hidden behind a server flag. JSX and panel code are **not deleted**. |
| **Default = no behavior change** | `glass.strip.minimalPublic=false` (default) must match pre-migration strip behavior. |
| **Glass = infrastructure** | API Keys and Spend are Glass-only surfaces. They never appear on Aletheia. |
| **Aletheia = identity/session** | Aletheia dashboard has no keys, spend, or memory admin. |
| **Founder override** | Local `glassDevMode=true` always shows power-user strip tabs, even when `minimalPublic=true`. |

---

## Flag reference

| Name | Source | Default | Parse rule | Local override |
|------|--------|---------|------------|----------------|
| `glass.strip.minimalPublic` | Server `/api/glass/runtime-config` → `ServerRuntimeFlags.minimalPublic` | `false` | `data.minimalPublic === true` (opt-in only) | `glassDevMode` via `showPowerUserTabs()` |

**Pure helper:** `src/shared/minimalPublicFlag.ts`

```ts
showPowerUserTabs({ minimalPublic, glassDevMode }) => !minimalPublic || glassDevMode
```

**Strip wiring:** `src/renderer/builder/BuilderStrip.tsx` — tab buttons wrapped in `{showPowerUserTabsValue && (...)}`; panel render paths and `BuilderTab` union unchanged.

---

## Deprecation map

### 1. API Keys strip tab

| Field | Value |
|-------|-------|
| **Strip tab id** | `"keys"` |
| **Strip label** | API Keys |
| **Strip icon** | 🗝 |
| **Panel component** | `ApiKeyManagerPanel` |
| **Flag gate** | Tab **button** hidden when `minimalPublic=true` and `glassDevMode=false` |
| **Code deleted?** | **No** — tab JSX, `BuilderTab` union entry, and `{activeTab === "keys" && ...}` panel path preserved |
| **New canonical surface** | **Glass System → Setup** (`DashboardSetupSections.tsx`) |
| **Setup test id** | `data-testid="glass-setup-api-keys"` |
| **Setup flag gate?** | **No** — always visible in Setup regardless of `minimalPublic` |
| **Clicks from strip (default)** | 1 click (tab) → panel |
| **Clicks when tab hidden** | Glass System dashboard → Setup nav → API Keys section (≤2 clicks from dashboard) |

**Reversal:** Set server `minimalPublic: false` (or enable founder `glassDevMode`). Strip tab reappears immediately; Setup section unchanged.

---

### 2. Spend strip tab

| Field | Value |
|-------|-------|
| **Strip tab id** | `"spend"` |
| **Strip label** | Spend |
| **Strip icon** | 💸 |
| **Panel component** | `SpendTrackerPanel` |
| **Flag gate** | Tab **button** hidden when `minimalPublic=true` and `glassDevMode=false` |
| **Code deleted?** | **No** — tab JSX, union entry, and `{activeTab === "spend" && ...}` panel path preserved |
| **New canonical surface** | **Glass System → Overview** (`GlassDashboard.tsx`) |
| **Overview test id** | `data-testid="glass-dashboard-spend-overview"` |
| **Overview flag gate?** | **No** — Spend section always visible on Overview |
| **Panel change** | `SpendTrackerPanel.onClose` is optional; Overview embed omits close button |
| **Clicks from strip (default)** | 1 click (tab) → panel |
| **Clicks when tab hidden** | Glass System dashboard → Overview → AI Spend section (≤2 clicks) |

**Reversal:** Set server `minimalPublic: false` (or founder override). Strip tab reappears; Overview section unchanged.

---

## Strip items **not** affected by `minimalPublic`

These tabs are unchanged by L3.1 and always visible in the strip (subject to existing product flags elsewhere):

| Tab id | Label | Notes |
|--------|-------|-------|
| `prompts` | Prompt Library | Unchanged |
| `power-prompt` | Prompt Gen | Unchanged |
| `extract` | Extract & Build Mode | Unchanged |
| `agents` | Agents | Unchanged |
| *(terminal toggle)* | Terminal | Unchanged |
| *(Aletheia)* | System / Aletheia menu | Unchanged (Layer 2 authority) |

---

## Behavior matrix

| `minimalPublic` | `glassDevMode` | API Keys strip tab | Spend strip tab | Setup API Keys | Overview Spend |
|-----------------|----------------|------------------|-----------------|----------------|----------------|
| `false` (default) | `false` | Visible | Visible | Visible | Visible |
| `false` | `true` | Visible | Visible | Visible | Visible |
| `true` | `false` | **Hidden** | **Hidden** | Visible | Visible |
| `true` | `true` | Visible (override) | Visible (override) | Visible | Visible |

---

## What was **not** migrated (by design)

| Surface | Reason |
|---------|--------|
| Aletheia dashboard | Keys/spend are Glass-privileged; Aletheia reads session recap only |
| Strip panel implementations | Same components reused in new Glass dashboard locations |
| `BuilderTab` type union | Preserves type safety and instant rollback via flag |
| Aletheia session delete | `deleteAletheiaSessionHistory` remains Glass Memory admin only (`dashboardIpc.ts`) |

---

## Source file index

| Concern | File |
|---------|------|
| Flag helper | `src/shared/minimalPublicFlag.ts` |
| Server flag type | `src/shared/serverRuntimeFlags.ts` |
| Server flag fetch | `src/main/serverRuntimeConfig.ts` |
| Strip tab gates | `src/renderer/builder/BuilderStrip.tsx` |
| API Keys new home | `src/renderer/dashboard/DashboardSetupSections.tsx` |
| Spend new home | `src/renderer/dashboard/GlassDashboard.tsx` |
| Spend panel optional close | `src/renderer/builder/SpendTrackerPanel.tsx` |

---

## Test coverage

| Layer | File | What it proves |
|-------|------|----------------|
| Unit | `src/test/minimalPublicFlag.test.ts` | `showPowerUserTabs()` truth table + server default `=== true` |
| Unit | `src/test/spendOverview.test.ts` | Overview embed, no Aletheia spend, no `minimalPublic` gate on Overview |
| E2E | `tests/e2e/glass-companion.spec.ts` G4 | Strip tab visibility for all four flag/dev combinations; Setup API Keys reachable when strip hidden |
| E2E | `tests/e2e/glass-companion.spec.ts` G1 | Aletheia authority unchanged |

---

## Build check (L3.6)

Run from `glass-app/`:

```bash
npx tsc --noEmit
```

**Expected:** 0 TypeScript errors.

Optional full Layer 3 unit batch:

```bash
npx tsx --test src/test/minimalPublicFlag.test.ts src/test/spendOverview.test.ts
```

---

## Operator quick reference

**Enable public/minimal strip (hide Keys + Spend shortcuts):**

```json
{ "minimalPublic": true }
```

in server runtime config response.

**Rollback to legacy strip (pre-migration behavior):**

```json
{ "minimalPublic": false }
```

or omit the field entirely (defaults false).

**Founder/dev keeps strip shortcuts while server sends minimal public:**

Local Glass dev mode (`glassDevMode=true`) overrides server `minimalPublic` for strip tabs only.

---

## Related docs

- [Layer 3 confirmation](/Users/newuser/Desktop/Layer3_Cursor_Confirmation.md) — audit checklist (Desktop)
- [Layer 2 confirmation](/Users/newuser/Desktop/Layer2_Cursor_Confirmation.md) — Aletheia authority & consent
- `src/shared/aletheiaAuthority.ts` — Aletheia allowlist (strip vs dashboard boundaries)
