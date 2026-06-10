# IIVO Lens — Chrome Web Store Submission Checklist

**Version:** 1.1.16  
**Manifest Version:** 3  

Work through every item before submitting. Items marked ✅ are confirmed ready.
Items marked 🔲 require action before submission.

---

## 1. Manifest & permissions

- ✅ `manifest_version: 3` (MV3 required for new submissions)
- ✅ `name`: "IIVO Lens" — clear, brand-consistent, under 45 chars
- ✅ `description`: under 132 chars, no keyword stuffing
- ✅ `version`: 1.1.16 — semver, no leading zeros
- ✅ `permissions`: `["activeTab", "scripting", "storage"]` — minimum required, no overbroad permissions
- ✅ `host_permissions`: `["https://iivo.ai/*"]` — only IIVO's own domain
- ✅ No `downloads`, `tabs`, `webRequest`, `browsingData`, or other sensitive permissions
- ✅ Content script runs at `document_idle` (not `document_start`) — minimal page impact
- ✅ No remote code execution — all JS is bundled in the extension package

## 2. Icons

- ✅ 16×16 PNG (`assets/icon-16.png`)
- ✅ 32×32 PNG (`assets/icon-32.png`)
- ✅ 48×48 PNG (`assets/icon-48.png`)
- ✅ 128×128 PNG (`assets/icon-128.png`) — required for store listing
- 🔲 **Store listing icon**: 128×128 PNG uploaded separately in Developer Dashboard (can use `assets/icon-128.png`)
- 🔲 **Promotional tile** (optional but recommended): 440×280 PNG for store shelf visibility

## 3. Store listing copy

- 🔲 **Short description** (up to 132 chars): e.g. "Capture any page and send it to IIVO for instant AI analysis and decision support."
- 🔲 **Detailed description**: explain what it does, what data is collected, why permissions are needed. No markdown — plain text only.
- 🔲 **Category**: Productivity
- 🔲 **Screenshots**: at least 1 required (1280×800 or 640×400 PNG/JPEG). Show the popup on a real page.
- 🔲 **Privacy practices**: fill out the Data Use disclosures in the Developer Dashboard (see Section 6 below)

## 4. Privacy & data disclosure

Chrome Web Store requires explicit answers to these questions in the Developer Dashboard:

| Question | Answer |
|----------|--------|
| Does the extension collect user data? | **Yes** — page title, URL, visible text, selected text |
| Is data tied to user identity? | **No** — no account, no PII |
| Is data sold? | **No** |
| Is data used for purposes other than the core feature? | **No** |
| Is data retained beyond the session? | Only if user explicitly clicks Save to Memory |

**Privacy policy URL required.** Use: `https://iivo.ai/privacy`  
Confirm the privacy policy at that URL explicitly covers the extension and what page data is sent.

## 5. Content security

- ✅ No `eval()` or `new Function()` in any extension JS
- ✅ No inline scripts in HTML (`popup.html` uses external `popup.js`)
- ✅ URL injection prevented — `sanitizeAppUrl()` validates all opened URLs to `https://iivo.ai/*`
- ✅ Auth tokens stripped from `sourceUrl` before transmission (`sanitizeSourceUrl()`)
- ✅ Content script is passive — only sends data when user explicitly triggers capture
- ✅ `isSensitivePage` detection flag added (banking, health, auth domains)
- ✅ `MAX_VISIBLE_TEXT_CHARS = 12_000` size cap enforced on all text captures
- ✅ Security audit complete — see `EXTENSION_SECURITY.md`

## 6. Packaging

Run before every submission:

```bash
cd browser-extension

# Verify no dev/test files sneak in
ls -la

# Files to include in zip:
#   manifest.json
#   background.js
#   contentScript.js
#   popup.js
#   popup.html
#   popup.css
#   assets/  (icons only — not prototype files)
#   lib/     (backgroundLogic.js, contentScriptLogic.js)
#
# DO NOT include:
#   tests/
#   prototype-*.html / prototype-*.css
#   EXTENSION_SECURITY.md
#   CHROME_STORE_CHECKLIST.md
#   README.md
#   package.json
#   node_modules/ (if present)

zip -r iivo-lens-1.1.16.zip \
  manifest.json \
  background.js contentScript.js popup.js popup.html popup.css \
  assets/icon-16.png assets/icon-19.png assets/icon-32.png \
  assets/icon-38.png assets/icon-48.png assets/icon-128.png \
  lib/backgroundLogic.js lib/contentScriptLogic.js
```

- 🔲 Verify zip size is under 10 MB (store limit)
- 🔲 Load unpacked in Chrome (`chrome://extensions` → Load unpacked) and smoke-test on a real page before uploading
- 🔲 Test on a banking page — confirm `isSensitivePage` flag is set correctly

## 7. Developer Dashboard

- 🔲 Sign in to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- 🔲 Pay one-time $5 developer registration fee (if not already paid)
- 🔲 Upload zip → fill store listing → fill privacy practices → submit for review
- 🔲 Review typically takes 1–3 business days for new extensions

## 8. Post-submission

- 🔲 Add store listing URL to `iivo.ai` website once approved
- 🔲 Set up version update flow: bump `manifest.json` version → repackage → upload new zip to Dashboard
- 🔲 Monitor Developer Dashboard for policy violation warnings

---

## Quick smoke-test script (before every submission)

```bash
# 1. Load extension in Chrome
# 2. Open any news/productivity page (e.g. ycombinator.com)
# 3. Click the IIVO Lens toolbar icon
# 4. Verify: pill shows "Offline" (IIVO server not running locally) OR "Live"
# 5. Verify: page title and preview text shown correctly
# 6. Open a banking page (e.g. chase.com) — sensitive page warning should show
# 7. Click Send to IIVO — new tab opens to https://iivo.ai/?lensAsk=<id>
# 8. Open DevTools → check for console errors → should be none
```
