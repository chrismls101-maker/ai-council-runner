# IIVO Glass — Beta Install Guide

Install IIVO Glass on your Mac and run your first question. No terminal, no configuration files, no developer setup.

**You need:** A Mac with Apple Silicon (M1, M2, M3, or M4). Intel Macs are not supported in this beta.

**Production server:** [iivo.ai](https://iivo.ai) — the app is already set up to use it.

---

## 1. Download

1. Open **[iivo.ai](https://iivo.ai)** in Safari or Chrome.
2. If you see a **password** screen, enter the preview password your invite included.
3. Click **Download for Mac — Apple Silicon**.

The file is named something like `IIVO Glass-0.1.9-arm64.dmg`. It will land in your **Downloads** folder.

---

## 2. Install

1. Double-click the `.dmg` file in Downloads.
2. Drag **IIVO Glass** into the **Applications** folder when the window opens.
3. Eject the disk image (right-click the desktop icon → **Eject**).

---

## 3. Open IIVO Glass

1. Open **Applications** (Finder → Applications, or Spotlight: press `⌘ Space`, type `IIVO Glass`).
2. Double-click **IIVO Glass**.

The first launch may take a few seconds while the boot animation plays. That is normal.

> **If macOS says the app cannot be opened:** The beta build is signed and notarized. If you still see a warning, right-click **IIVO Glass** → **Open** → **Open** once. You should only need to do this once.

---

## 4. First-run welcome (optional)

A short welcome may ask three quick questions (your name, what you do, what you are focused on). Answer them or click **Skip** — either way works.

When it finishes, you will see:

- A small **Glass** dock (toolbar) on your screen
- A **command bar** at the bottom center where you type questions

---

## 5. Grant permissions

Glass needs macOS permission before it can hear you or see your screen. **Nothing is recorded until you start it.**

### Screen Recording

Required for screen capture and some audio features.

1. Click **Capture** on the Glass dock, **or** ask a question that uses your screen.
2. macOS may show a prompt — click **OK** or **Open System Settings**.
3. Go to **System Settings → Privacy & Security → Screen Recording**.
4. Turn **IIVO Glass** **on**.
5. **Quit IIVO Glass completely** (menu bar → **IIVO Glass → Quit**, or `⌘ Q`), then open it again.

### Microphone

Required if you want voice input or live meeting transcription.

1. Click the **microphone** icon on the command bar, **or** start listening from the panel.
2. When macOS asks, click **OK**.
3. If you do not see a prompt: **System Settings → Privacy & Security → Microphone** → turn **IIVO Glass** **on**.

### System Audio (optional)

Only needed if you want Glass to hear audio playing on your Mac (meetings, videos). On newer macOS versions this may appear as **System Audio Recording** under Privacy & Security.

---

## 6. Connect to iivo.ai

1. On the Glass dock, click **Open Panel**.
2. At the top of the panel, click **CONNECT IIVO GLASS**.
3. Wait until the button shows **IIVO GLASS CONNECTED** (green dot).

Under **Setup**, check that status rows look healthy:

| Row | What you want |
|-----|----------------|
| **Server** | Connected to iivo.ai (no error) |
| **Screen** | Ready after you granted Screen Recording |
| **Microphone** | Ready after you granted Microphone |

If **Server** shows an error, check your internet connection and try **CONNECT IIVO GLASS** again. You do not need to type any server address — the app already points at **iivo.ai**.

---

## 7. Run your first ask

1. Click in the **command bar** at the bottom of your screen (the pill-shaped input).
2. Type a simple question, for example: `What is IIVO Glass in one sentence?`
3. Press **Enter** or click the **send** arrow.

You should see a short “thinking” state, then an **answer card** above the command bar. You can **Copy**, **Pin**, or dismiss it.

That confirms Glass is installed, connected to production, and working.

---

## Quick reference

| What | Where |
|------|--------|
| Download | [iivo.ai](https://iivo.ai) |
| Glass dock | Small floating toolbar labeled **Glass** |
| Settings & connect | Dock → **Open Panel** |
| Ask a question | Bottom **command bar** |
| Capture screen | Dock → **Capture** |
| Stop everything | Dock → **Stop Everything** |
| Quit | `⌘ Q` or menu **IIVO Glass → Quit** |

---

## Something not working?

**IIVO Glass does not appear in Privacy settings**  
Make sure you opened the app from **Applications**, not a download folder copy. Drag it to Applications if needed.

**Permission is on but capture still fails**  
Quit Glass fully (`⌘ Q`), reopen once, and click **CONNECT IIVO GLASS** again in the panel.

**Answer never appears / Server error**  
Open Panel → **CONNECT IIVO GLASS**. Confirm **Server** is not red. Check Wi‑Fi.

**Only “Electron” in Privacy lists**  
That is a developer build, not the beta app. Install from the DMG above and use **IIVO Glass** from Applications.

**Still stuck?**  
Note what you see (especially any red rows in Setup), your macOS version, and whether you are on Apple Silicon. Send that to your beta contact.

---

*IIVO Glass beta · Mac Apple Silicon · Server: iivo.ai*
