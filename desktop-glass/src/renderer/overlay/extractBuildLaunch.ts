/**
 * Generate master prompt (if needed) and hand off to Glass / Cursor / Claude.
 */

import type { ExtractBuildTarget } from "../../shared/extractBuildHandoff.ts";
import {
  getExtractModeState,
  setExtractModeState,
} from "./extractModeStore.ts";

export async function launchExtractBuild(
  target: ExtractBuildTarget,
): Promise<{ ok: boolean; error?: string; notice?: string }> {
  const em = getExtractModeState();
  let prompt = em.masterPrompt?.trim() ?? "";

  if (!prompt) {
    if (!em.transcript.trim()) {
      return { ok: false, error: "No transcript yet — keep listening or paste a transcript." };
    }
    setExtractModeState({ generating: true, masterPrompt: null });
    try {
      const res = await window.glass.extractGenerate({
        transcript: em.transcript,
        detectedLabel: em.detectedLabel ?? undefined,
      });
      if (res.error) {
        setExtractModeState({ generating: false });
        return { ok: false, error: res.error };
      }
      prompt = res.prompt?.trim() ?? "";
      if (!prompt) {
        setExtractModeState({ generating: false });
        return { ok: false, error: "Generation returned an empty prompt." };
      }
      setExtractModeState({ generating: false, masterPrompt: prompt });
    } catch (err) {
      setExtractModeState({ generating: false });
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Generation failed",
      };
    }
  }

  try {
    const handoff = await window.glass.extractBuildHandoff({ target, prompt });
    if (!handoff.ok) {
      return { ok: false, error: handoff.error ?? "Build handoff failed" };
    }
    if (handoff.error) {
      return { ok: true, error: handoff.error, notice: handoff.notice };
    }
    return { ok: true, notice: handoff.notice };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Build handoff failed",
    };
  }
}
