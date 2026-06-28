import type { DesignCaptureQuality, DesignCaptureQualityIssue } from "../../shared/designToCode.ts";

function parseDataUrlMeta(dataUrl: string): { mime: string; base64Len: number } | null {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match?.[2]) return null;
  return { mime: match[1]!, base64Len: match[2].length };
}

/** Heuristic capture quality — no native image decode required. */
export function analyzeCaptureQuality(imageDataUrl: string): DesignCaptureQuality {
  const issues: DesignCaptureQualityIssue[] = [];
  const meta = parseDataUrlMeta(imageDataUrl);

  if (!meta) {
    return {
      readable: false,
      confidence: 0.1,
      issues: ["low_signal"],
      recommendation: "Capture failed — try again.",
    };
  }

  const approxBytes = Math.floor((meta.base64Len * 3) / 4);
  if (approxBytes < 8_000) {
    issues.push("low_signal");
  }
  if (approxBytes < 4_000) {
    issues.push("partial_capture");
  }

  // Very small PNG/JPEG often means blank or tiny viewport
  if (approxBytes < 15_000 && meta.mime.includes("png")) {
    issues.push("tiny_text");
  }

  // Large but low bytes-per-pixel heuristic skipped without sharp
  if (approxBytes > 0 && approxBytes < 25_000) {
    issues.push("blurry");
  }

  const confidence = Math.max(
    0.15,
    Math.min(1, 0.35 + Math.log10(Math.max(approxBytes, 500)) / 5 - issues.length * 0.12),
  );

  const readable = confidence >= 0.35 && !issues.includes("low_signal");

  let recommendation: string | undefined;
  if (!readable) {
    recommendation = "Capture quality looks weak — recapture for better results.";
  } else if (issues.length > 0) {
    recommendation = "You can continue, but recapture may improve fidelity.";
  }

  return {
    readable,
    confidence: Math.round(confidence * 100) / 100,
    issues: [...new Set(issues)],
    recommendation,
  };
}

export function qualityWarningLabel(quality: DesignCaptureQuality): string | null {
  if (quality.confidence >= 0.55 && quality.issues.length === 0) return null;
  if (quality.recommendation) return quality.recommendation;
  return `Capture confidence ${Math.round(quality.confidence * 100)}% — ${quality.issues.join(", ")}`;
}
