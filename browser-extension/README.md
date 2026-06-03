# IIVO Lens (Chrome Extension)

**IIVO Lens** captures page context you explicitly choose and sends it to your local IIVO app via the Context Bridge API.

> IIVO Lens only sends context after you click an action.

## Load locally (Chrome)

1. Start IIVO from the project root: `npm run dev` (client `:5173` + server `:3001`).
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select this folder: `browser-extension/`
6. Visit any `http://` or `https://` page and click the **IIVO Lens** extension icon.

## How each action works

When you open the popup, IIVO Lens captures a **preview only** — nothing is sent until you click a button.

| Action | What is sent | What happens next |
|--------|----------------|-------------------|
| **Ask IIVO About This Page** | Page metadata + page text (or selected text + metadata if you have a selection) | Saves context, opens IIVO with `?lensAsk=<id>`, attaches chip, fills analysis prompt |
| **Send Selected Text** | Selected text only | Saves selection, opens IIVO with `?lensContextId=<id>` |
| **Save Page as Evidence** | Full page context as evidence | Saves to Context Library only (no composer attach) |
| **Attach Page Context** | Full page context | Saves context, opens IIVO with `?lensContextId=<id>` |
| **Send Screenshot to IIVO** | Visible tab PNG (after confirmation) | Captures visible tab, shows preview, then Ask or Save |
| **Open IIVO** | Nothing | Opens `http://localhost:5173/` |

### Screenshot capture (visible tab only)

1. Click **Send Screenshot to IIVO** — captures the **visible part** of the current tab only (not full-page scroll).
2. Review the thumbnail preview, image type, and file size.
3. Confirm:
   - **Ask IIVO About Screenshot** — saves image + metadata, opens IIVO with `?lensAsk=<id>`
   - **Save Screenshot as Evidence** — saves to Context Library only
   - **Cancel** — discards the pending screenshot

Screenshot images are stored locally on disk at `data/context/screenshots/<id>.png` (not embedded as huge base64 in JSON).

**Permission:** Uses `activeTab` + `chrome.tabs.captureVisibleTab` when you click the screenshot action. No always-on screen access.

### Selected text vs full page

- If you have text selected, **Send Selected Text** uses the selection only.
- **Ask IIVO About This Page** prefers selected text when present, and also includes page metadata and page preview context.
- If there is no selection, page context (title, URL, meta description, visible page text) is used.

### Capture preview

The popup shows **“Review what IIVO will receive.”** with:

- Page title and domain
- Selection status
- Text preview (selection if present, otherwise page text)
- Character count
- Capture type hint
- Truncation warning when page text exceeds 12,000 characters

## What data is sent

When you click an action, IIVO Lens may send:

- Page title
- Page URL
- Selected text (when applicable)
- Visible page text (`innerText`, capped at 12,000 characters)
- Meta description (when available)
- Capture metadata: `capturedVia: browser_lens`, capture type, timestamps
- Truncation metadata when applicable: `originalTextLength`, `sentTextLength`, `truncated`
- Screenshot PNG (visible tab only) when you confirm a screenshot action — stored as a file reference, with `imageMimeType` and `imageSizeBytes` metadata

Data is POSTed to `http://localhost:3001/api/context`.

## What is not sent

- Nothing is sent when you only open the popup
- No continuous monitoring or background capture
- No automatic or hidden screenshots
- No full-page scrolling screenshots (visible tab only)
- No desktop or full-screen capture outside the browser tab
- No login credentials or form fields beyond visible page text
- No cloud upload — local IIVO backend only during development

## Privacy model

- **Explicit actions only** — context leaves the browser only after you click a button
- **Local backend** — development uses your machine (`localhost:3001` / `localhost:5173`)
- **No hidden capture** — text preview runs when the popup opens, but sending (including screenshots) requires your click
- **Visible-tab screenshots only** — IIVO Lens can capture the visible part of the current browser tab only after you click the screenshot action
- **Some pages may provide incomplete text** — SPAs, paywalls, or script-blocked pages may yield less content

Popup footer: *“IIVO Lens only sends context after you click an action.”*

## Duplicate warning

If the same page URL was already sent via IIVO Lens within the last 24 hours, the popup warns you. You can still send again or open the existing item in IIVO.

## Offline and error handling

**IIVO not running:**

> IIVO is not running. Start IIVO with npm run dev, then try again.

Buttons: **Retry connection**, **Open IIVO**

**Server error:**

> IIVO could not receive this context. Try again or paste the text manually.

Technical details appear in a collapsed **Details** section.

## Success messages

| Action | Message |
|--------|---------|
| Ask IIVO About This Page | Sent to IIVO. Opening chat… |
| Attach Page Context | Context attached in IIVO. |
| Save Page as Evidence | Saved to Context Library. |
| Send Selected Text | Selected text sent to IIVO. |

## Troubleshooting

### IIVO not running

Run `npm run dev` from the project root. Confirm `http://localhost:3001/api/health` responds, then click **Retry connection** in the popup.

### Page text missing or very short

Some sites render content after load, block scripts, or use canvas-only UI. Try selecting the text manually and use **Send Selected Text**.

### Selected text not detected

Selection must exist on the active tab when the popup opens. Re-select text, close and reopen the popup.

### Context does not appear in IIVO

1. Confirm the server is running
2. Open **Context Library** in IIVO sidebar
3. For attach/ask actions, confirm the IIVO tab opened with `?lensContextId=` or `?lensAsk=`
4. If the context was deleted, IIVO shows: *“IIVO Lens context could not be attached. It may have been deleted.”*

## Manual QA checklist (extension)

1. Load unpacked extension; open popup on a normal article page
2. Verify preview shows title, domain, text preview, character count — **no send yet**
3. Select text; reopen popup — verify selection hint and **Send Selected Text** enabled
4. On a long page (>12k chars), verify truncation warning
5. With IIVO stopped — verify offline message, Retry, Open IIVO
6. With IIVO running — **Save Page as Evidence** → item appears in Context Library with Lens badge
7. **Attach Page Context** → IIVO opens with context chip attached
8. **Ask IIVO About This Page** → IIVO opens with chip + composer prompt filled
9. Send same URL twice within 24h — verify duplicate warning
10. Re-send deleted context via `?lensContextId=bad-id` — verify friendly error in IIVO
11. **Send Screenshot to IIVO** — verify thumbnail preview before send
12. **Ask IIVO About Screenshot** — verify IIVO opens with screenshot chip + “Analyze this screenshot” prompt
13. **Save Screenshot as Evidence** — verify PNG appears in Context Library with Lens badge + thumbnail

Automated QA (no extension install): `npm run qa:lens` and `npm run test:lens`

## Premium Dark-Glass UI QA (extension popup)

Manual checks in Chrome (`chrome://extensions` → reload IIVO Lens):

1. Online state: header shows dark optical orb, **IIVO Lens**, “Intelligence layer active”, and a green **Live** pill.
2. Preview state: page intelligence card shows domain, title, and context readiness before any send.
3. Selected text state: selected-text module glows subtly blue and shows selected character count; no-selection state stays subdued.
4. Screenshot captured state: screenshot chamber shows thumbnail with luminous scan corners and PNG/size/Visible tab/Just now metadata.
5. Vision ready badge: screenshot module displays the compact **Vision Ready** badge when capture preview is active.
6. Duplicate warning: same URL within 24h shows compact amber dark-glass warning with **Open existing**.
7. Offline state: stopping IIVO shows amber/red dark-glass state with Retry and Open IIVO.
8. Error details: errors use a red-tinted status card and collapsed **Details** by default.
9. Success state: sends show compact green/cyan success copy such as “Sent to IIVO. Opening chat…”.
10. Trust footer: shield strip says **Only sends after you click.** and “Your context stays in your control.”

Playwright does **not** cover the extension popup UI — manual Chrome inspection required.

## Files

- `manifest.json` — Manifest V3
- `popup.html` / `popup.css` / `popup.js` — Extension UI with capture preview
- `contentScript.js` — On-demand page capture (12,000 char cap)
- `background.js` — Opens IIVO tabs

## Limitations (v1)

- Visible text only (`innerText`); page text capped at 12,000 characters
- Visible-tab screenshot only (no full-page scroll capture)
- Screenshot **capture** is free; **visual analysis** uses additional credits when image vision is enabled
- Localhost backend only
- Chrome extension popup UI is manually tested; Playwright covers app handoff and Context Library metadata

## Image vision (screenshot analysis)

When `IMAGE_VISION_ENABLED=true` and an OpenAI API key is configured, IIVO can send screenshot pixels to an image-capable model for visual analysis. Screenshots are only analyzed when you explicitly capture or attach them and send a visual analysis prompt.

**Enable (project root `.env`):**

```env
IMAGE_VISION_ENABLED=true
IMAGE_VISION_PROVIDER=openai
IMAGE_VISION_MODEL=          # optional; defaults to gpt-4o when supported
OPENAI_API_KEY=sk-...
```

**ScreenshotOne is separate** — it is for server-side URL screenshot capture (future Import URL preview), not for analyzing Lens screenshots. Do not use ScreenshotOne as the vision model.

### Manual QA checklist (vision)

1. Reload the extension after code changes (`chrome://extensions` → reload)
2. Capture a visible-tab screenshot via **Send Screenshot to IIVO**
3. **Save Screenshot as Evidence** — verify thumbnail in Context Library
4. **Ask IIVO About Screenshot** — verify composer shows screenshot chip + “Analyze this screenshot…” prompt
5. **Vision disabled** (`IMAGE_VISION_ENABLED=false` or unset):
   - Composer note: “Visual analysis not configured” / “Image analysis is not configured”
   - Send prompt — answer should not claim detailed pixel-level review
   - Trace: **Screenshot analyzed visually: no**
6. **Vision enabled** (`IMAGE_VISION_ENABLED=true`, valid `OPENAI_API_KEY`):
   - Composer chip: “Vision analysis available”
   - Send screenshot analysis prompt — answer should describe visible UI/content
   - Trace: **Screenshot analyzed visually: yes**, provider/model, image size, title/URL
   - Credits: Direct Answer (1) + Vision add-on (2) = **3 credits**
7. Context Library → select screenshot → **Analyze Screenshot** — attaches + fills composer (no auto-send)
8. Optional live QA: `VISION_QA_LIVE=1 npm run qa:lens:vision` (requires vision enabled + provider key)

Automated (default, vision off): `npm run qa:lens` and `npm run test:lens`
