/**
 * Glass Companion — ambient conversation classifier (not talking to me).
 */

export interface AmbientDetectionResult {
  addressedToCompanion: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
}

const DEVICE_DIRECTED = [
  /\b(can you|could you|will you|would you|please)\b/i,
  /\b(show me|tell me|explain|summarize|help me|what is|what are|how do|how can|why is|find|search|open|close|write|read|translate)\b/i,
  /\b(aletheia|hey glass|iivo|hey computer)\b/i,
];

const HUMAN_TO_HUMAN = [
  /\b(yeah|right|exactly|totally|for sure|no way|seriously|i know|oh my god|that's crazy|honestly|literally)\b/i,
  /\b(did you see|have you heard|do you remember|what did you think|i was telling|she said|he said|they said)\b/i,
  /\b(okay so|anyway|like i said|the thing is|you know what|listen|so basically|and then he|and then she)\b/i,
];

export function detectAmbientConversation(
  text: string,
  speakerId?: number,
  prevSpeakerId?: number,
  speakerChangeCount?: number,
): AmbientDetectionResult {
  const wordCount = text.trim().split(/\s+/).length;

  if (/\b(aletheia|hey glass|iivo)\b/i.test(text)) {
    return { addressedToCompanion: true, confidence: "high", reason: "explicit_address" };
  }

  if (speakerChangeCount !== undefined && speakerChangeCount >= 2) {
    const deviceHit = DEVICE_DIRECTED.some((re) => re.test(text));
    if (!deviceHit) {
      return { addressedToCompanion: false, confidence: "high", reason: "multiple_speakers" };
    }
  }

  if (
    speakerId !== undefined
    && prevSpeakerId !== undefined
    && speakerId !== prevSpeakerId
  ) {
    const deviceHit = DEVICE_DIRECTED.some((re) => re.test(text));
    if (!deviceHit) {
      return { addressedToCompanion: false, confidence: "medium", reason: "speaker_change" };
    }
  }

  const humanHit = HUMAN_TO_HUMAN.some((re) => re.test(text));
  if (humanHit && wordCount < 12) {
    return { addressedToCompanion: false, confidence: "medium", reason: "social_utterance" };
  }

  const deviceHit = DEVICE_DIRECTED.some((re) => re.test(text));
  if (deviceHit) {
    return { addressedToCompanion: true, confidence: "medium", reason: "device_phrasing" };
  }

  return { addressedToCompanion: false, confidence: "low", reason: "ambiguous_default_silent" };
}

export function looksLikeDirectQuestion(text: string): boolean {
  return DEVICE_DIRECTED.some((re) => re.test(text));
}
