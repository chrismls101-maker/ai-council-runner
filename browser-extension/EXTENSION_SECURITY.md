# IIVO Lens — Extension Security Audit

**Audited:** 2026-06-10  
**Version:** 1.1.16  
**Scope:** content script injection, data capture, background URL handling, size guards

---

## Security model summary

IIVO Lens is a **user-triggered capture** extension. The content script runs passively on all pages (required to be ready for capture) but transmits **zero data** until the user explicitly:

1. Clicks the toolbar popup
2. Reviews the preview of what will be captured
3. Clicks **Send to IIVO**

There is no background scraping, no auto-send, and no telemetry from the content script itself.

---

## Findings & mitigations

### 1. Background open-redirect (FIXED)

**Risk:** `background.js` previously passed `message.url` directly to `chrome.tabs.create()` without validation. A compromised content script on a malicious page could send `IIVO_LENS_OPEN_APP` with an arbitrary URL, causing IIVO Lens to open a phishing or malicious tab.

**Fix:** `sanitizeAppUrl()` in `lib/backgroundLogic.js` now validates that any URL passed via message is:
- `https:` scheme only
- `hostname === "iivo.ai"` exactly (subdomains rejected)
- Embedded credentials stripped (`user:pass@host` → stripped)

Any URL that fails validation falls back to `DEFAULT_APP_URL = "https://iivo.ai/"`.

**Tests:** 10 `sanitizeAppUrl` tests + 5 handler-level injection tests in `tests/background.test.js`.

---

### 2. Auth token leakage in sourceUrl (FIXED)

**Risk:** `capturePageContext()` previously included `location.href` verbatim. On OAuth callback pages, this URL contains `?code=AUTH_CODE` or `#access_token=TOKEN` in the query/fragment.

**Fix:** `sanitizeSourceUrl()` in `lib/contentScriptLogic.js`:
- Strips known sensitive query params: `token`, `access_token`, `code`, `state`, `session`, `api_key`, `jwt`, `bearer`, and others (full list in `SENSITIVE_PARAMS` Set)
- Strips the URL fragment entirely (implicit-flow OAuth tokens live here)
- Preserves the path and non-sensitive query params

**Tests:** 7 `sanitizeSourceUrl` tests in `tests/contentScript.test.js`.

---

### 3. Sensitive page detection (ADDED)

**Risk:** The content script runs on all `http/https` pages, including banking, password managers, and healthcare portals. While capture is user-triggered, a user might accidentally click Send without realizing they're on a sensitive page.

**Mitigation:** `capturePageContext()` now includes `isSensitivePage: boolean` in its payload. The popup can use this flag to show a confirmation warning before enabling Send. Detected patterns include: banking keywords, payment services (PayPal, Venmo), password managers (1Password, LastPass, Bitwarden), healthcare portals (MyChart, MyHealth), and government domains (irs.gov, ssa.gov).

This is informational — capture is NOT blocked. The user decides.

**Tests:** `isSensitiveHostname` (5 tests) + `capturePageContext` security fields (5 tests).

---

### 4. Content size guard (CONFIRMED)

**`MAX_VISIBLE_TEXT_CHARS = 12_000`** is enforced in `getVisibleTextPayload()`. Text beyond this limit is truncated and a notice `[Page text truncated by IIVO Lens.]` is appended. The payload includes `originalTextLength`, `sentTextLength`, and `truncated` fields so the server and UI can display accurate size information.

**Tests:** 3 boundary tests added — exactly-at-limit (not truncated), at-limit+1 (truncated), truncation notice presence.

---

### 5. Password field exposure (CONFIRMED SAFE)

`document.body.innerText` does **not** include the value of `<input type="password">` elements. Browser engines exclude form input values from `innerText` for security reasons. Passwords cannot leak via the content script's text capture path.

---

### 6. Injection scope — manifest `matches`

The content script runs on all `http://*/*` and `https://*/*` pages. This is intentional — the extension needs to be active on any page the user wants to capture. The passive security posture (no proactive sending) makes this safe.

The `exclude_matches` approach (blocking specific banking domains) was considered and rejected: it is a whack-a-mole approach that gives false confidence while breaking legitimate use cases (e.g., a user might legitimately want to capture a non-sensitive page on a banking site). `isSensitivePage` detection + UI warning is the preferred approach.

---

## Test counts

| File | Tests | Pass |
|------|-------|------|
| `tests/contentScript.test.js` | 45 | 45 |
| `tests/background.test.js` | 24 | 24 |
| **Total** | **69** | **69** |

---

## Pre-Store submission checklist

- [x] No `eval()` or `Function()` constructor usage
- [x] No remote code execution (all logic is bundled)
- [x] `host_permissions` limited to `https://iivo.ai/*`
- [x] No unused permissions (`downloads` removed in v1.1.16)
- [x] Content script is passive — no proactive data transmission
- [x] Background URL injection prevented by `sanitizeAppUrl()`
- [x] Auth tokens stripped from captured URLs
- [x] Size guard at 12,000 chars confirmed tested
- [x] `isSensitivePage` flag available for popup warning UI
