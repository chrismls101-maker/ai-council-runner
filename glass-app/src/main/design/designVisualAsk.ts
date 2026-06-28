import type { GlassConfig } from "../../shared/config.ts";
import { askIivoGlass } from "../glassAskClient.ts";

/** Background visual ask for design repair — does not push feed items. */
export async function runDesignSilentVisualAsk(
  config: GlassConfig,
  prompt: string,
  imageDataUrl: string,
  opts?: { sessionId?: string; taskComplexity?: "standard" | "deep" },
): Promise<string | undefined> {
  try {
    const response = await askIivoGlass(config, {
      prompt,
      visualIntent: true,
      latestScreenshot: {
        imageDataUrl,
        sourceTitle: "Design capture",
      },
      responseStyle: "full",
      modelPurpose: opts?.taskComplexity === "deep" ? "diagnostic" : "default",
      modelCallSource: "other",
      session: opts?.sessionId ? { sessionId: opts.sessionId } : undefined,
    });
    return response.answer?.trim() || undefined;
  } catch (err) {
    console.warn("[DesignToCode] silent visual ask failed:", err);
    return undefined;
  }
}
