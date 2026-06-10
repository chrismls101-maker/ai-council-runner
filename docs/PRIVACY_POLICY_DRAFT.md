# IIVO Glass — Privacy Policy

> **DRAFT — For Legal Review**
> This document was pre-written to cover current and planned product features.
> Have a qualified attorney review before public launch.
> Last updated: June 10, 2026

---

## 1. Overview

IIVO ("we," "us," "our") builds tools that help people think, learn, and work better using AI. This Privacy Policy explains what data we collect, how we use it, who we share it with, and what rights you have over your data.

We designed IIVO Glass to be as privacy-preserving as possible: audio is processed transiently, we do not sell your data, and you retain ownership of everything you capture.

---

## 2. What We Collect

### 2.1 Data You Create When Using the Service

| Data Type | When Collected | Why |
|-----------|---------------|-----|
| **Audio** | When Listen Mode or Voice Mode is active | Required to generate transcripts |
| **Transcripts** | Generated from your audio in real time | Required to generate AI notes |
| **AI Notes** | Generated from your transcripts | The core product output |
| **Screenshots** | Only when Visual Ask feature is used | Provides screen context to AI |
| **Session metadata** | Start/end time, duration, mode used | Service improvement and billing |
| **Topic summaries** | Short AI-generated descriptions of sessions | Displayed in your session history |
| **Speaker names** | Extracted from transcript patterns or browser tab titles | Personalizes AI notes |

### 2.2 Data We Collect Automatically

| Data Type | Why |
|-----------|-----|
| **App version** | For update delivery and debugging |
| **Operating system version** | Compatibility and crash reporting |
| **Crash reports and error logs** | Sent to Sentry for debugging; contains no audio or transcript content |
| **Feature usage analytics** (future) | To understand which features are used; no personally identifiable content |

### 2.3 Data You Provide Directly (Future — Account Features)

When account creation and billing are introduced:
- Name and email address
- Payment information (processed by Stripe; we never store your card number)
- Profile preferences and settings

### 2.4 What We Do NOT Collect

- We do not record audio when the Service is not actively in a capture session
- We do not capture keystrokes, passwords, or clipboard content
- We do not continuously monitor your screen (screenshots are only taken on your explicit command via Visual Ask)
- We do not sell your data to advertisers or data brokers

---

## 3. How We Use Your Data

| Purpose | Data Used |
|---------|-----------|
| Transcribe your audio | Audio → Deepgram (third-party) |
| Generate AI notes and summaries | Transcripts → IIVO server → OpenAI (third-party) |
| Translate audio content | Transcripts → DeepL (third-party) |
| Display your session history | Notes, summaries, metadata — stored locally on your device |
| Debug crashes and errors | Crash reports → Sentry (no audio or transcript content) |
| Improve the Service | Aggregated, anonymized usage patterns only |
| Communicate with you | Email address (when accounts are introduced) |
| Process payments | Billing data → Stripe (third-party) |

---

## 4. Third-Party Services and Data Sharing

IIVO uses the following third-party services that may receive your data:

### 4.1 Deepgram (Speech-to-Text)
Your audio is transmitted to Deepgram's servers for transcription. Deepgram processes audio under their own Privacy Policy. Audio is transmitted over encrypted connections. Please review [Deepgram's Privacy Policy](https://deepgram.com/privacy) for details on their data retention practices.

### 4.2 OpenAI (AI Processing)
Transcripts and context are transmitted to OpenAI's API for note generation. We use the API (not ChatGPT); OpenAI does not use API inputs to train their models by default. Please review [OpenAI's Privacy Policy](https://openai.com/privacy) and API data usage policies.

### 4.3 DeepL (Translation)
When translation mode is active, transcripts are transmitted to DeepL. Please review [DeepL's Privacy Policy](https://www.deepl.com/privacy).

### 4.4 Sentry (Error Reporting)
Crash reports and error logs are transmitted to Sentry. These contain technical data (stack traces, app version, OS version) but do **not** contain audio, transcripts, or notes. Please review [Sentry's Privacy Policy](https://sentry.io/privacy/).

### 4.5 Stripe (Future — Payments)
Payment processing will be handled by Stripe. IIVO never receives or stores your full payment card number. Please review [Stripe's Privacy Policy](https://stripe.com/privacy).

### 4.6 Calendar and Conferencing Integrations (Future)
When meetings mode is introduced, IIVO may request access to your calendar (Google Calendar, Outlook) and integrate with conferencing tools (Zoom, Google Meet, Teams). We will request only the minimum permissions needed. You can revoke these permissions at any time.

### 4.7 We Do Not Sell Your Data
We do not sell, rent, or trade your personal information or content to any third party for advertising or commercial purposes. Ever.

---

## 5. Data Storage and Retention

### 5.1 Local Storage
By default, your notes, session history, and settings are stored locally on your device. This data is not uploaded to IIVO's servers unless you use a feature that requires it (e.g., syncing across devices, future cloud backup).

### 5.2 Server-Side Processing
Audio and transcripts are transmitted to process your requests but are **not stored on IIVO's servers** beyond what is necessary to complete the request. Processing happens transiently — we are not building a database of your conversations.

### 5.3 Future Cloud Features
If cloud sync or cross-device features are introduced, you will be given explicit control over what is synced and the ability to delete your cloud data at any time.

### 5.4 Deletion
- You can delete your local session history from within the app at any time
- If you delete the app, all locally stored data is removed
- For any server-side data: email us at [privacy@iivo.com] and we will delete it within 30 days

---

## 6. Audio Data — Special Handling

Audio is the most sensitive data IIVO handles. We treat it accordingly:

- Audio is **streamed** to transcription services in real time and not stored after transcription
- Transcripts are retained only as long as you keep them in your session history
- We strongly recommend you not capture sessions containing attorney-client privilege, medical information, or other highly sensitive communications
- We do not use your audio or transcripts to train our AI models or any third-party AI models without your explicit opt-in consent

---

## 7. Children's Privacy

The Service is not directed to children under 13 (or under 16 in the EU/UK). We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, contact us at [privacy@iivo.com] and we will delete it.

---

## 8. Your Rights

Depending on your jurisdiction, you may have the following rights:

| Right | What It Means |
|-------|--------------|
| **Access** | Request a copy of data we hold about you |
| **Correction** | Request correction of inaccurate data |
| **Deletion** | Request deletion of your data ("right to be forgotten") |
| **Portability** | Request your data in a machine-readable format |
| **Objection** | Object to certain processing of your data |
| **Restriction** | Request we restrict processing of your data |
| **Withdraw consent** | Withdraw consent for processing at any time |

**California residents (CCPA):** You have the right to know what personal information we collect, the right to delete it, and the right to opt out of its sale (we don't sell it). To exercise these rights, contact [privacy@iivo.com].

**EU/UK residents (GDPR/UK GDPR):** Our legal basis for processing is performance of a contract (providing the Service you requested) and legitimate interests (improving the Service). You have the rights listed above. Our Data Protection contact is [privacy@iivo.com].

To exercise any of these rights, email [privacy@iivo.com]. We will respond within 30 days.

---

## 9. Security

We use industry-standard security measures to protect your data:

- All data transmitted between the app and our servers is encrypted (TLS 1.2+)
- API keys and secrets are stored securely and never exposed to client-side code
- We use Sentry for crash monitoring to quickly identify and fix security-related issues
- We limit employee access to user data to those who need it to provide the Service

No system is perfectly secure. If you discover a security vulnerability, please report it responsibly to [security@iivo.com].

---

## 10. Changes to This Policy

If we make material changes to this Privacy Policy, we will notify you via email (when accounts exist) or via in-app notification at least 14 days before changes take effect. The "Last updated" date at the top of this page reflects the most recent revision.

---

## 11. Contact

For privacy questions or to exercise your rights:

**IIVO Privacy**
Email: [privacy@iivo.com — replace with real address]
Website: [iivo.com/privacy — replace with real URL]

For legal notices:
Email: [legal@iivo.com — replace with real address]

---

*This Privacy Policy was last updated June 10, 2026. This is a draft for legal review prior to public launch.*
