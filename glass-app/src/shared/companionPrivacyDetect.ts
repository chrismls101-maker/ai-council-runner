/**
 * Glass Companion — privacy mode voice triggers.
 */

import { looksLikeDirectQuestion } from "./companionAmbientDetect.ts";

export { looksLikeDirectQuestion };

const PRIVACY_TRIGGERS = [
  /\b(stop listening|go dark|privacy mode|give us a minute|give me a minute|don't listen|go quiet|be quiet|mute yourself|go away for)\b/i,
  /\b(i need privacy|we need privacy|private conversation|not for you)\b/i,
  /\b(come back in|check back in|back in)\s+(\d+)\s*(min|minute|hour)/i,
];

export function detectPrivacyIntent(text: string): { isPrivacy: boolean; durationMs?: number } {
  for (const re of PRIVACY_TRIGGERS) {
    if (!re.test(text)) continue;
    const durationMatch = text.match(/(\d+)\s*(min|minute|hour)/i);
    if (durationMatch) {
      const n = parseInt(durationMatch[1]!, 10);
      const unit = durationMatch[2]!.toLowerCase();
      const durationMs = unit.startsWith("h") ? n * 3_600_000 : n * 60_000;
      return { isPrivacy: true, durationMs };
    }
    return { isPrivacy: true };
  }
  return { isPrivacy: false };
}

const RESUME_TRIGGERS = [
  /\b(come back|i'm back|you can listen|resume|stop privacy|end privacy|you're good|we're good)\b/i,
];

export function detectResumeIntent(text: string): boolean {
  if (/\b(come back in|check back in|back in)\s+\d+\s*(min|minute|hour)/i.test(text)) {
    return false;
  }
  return RESUME_TRIGGERS.some((re) => re.test(text));
}
