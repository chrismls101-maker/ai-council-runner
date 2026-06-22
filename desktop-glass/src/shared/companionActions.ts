/**
 * Glass Companion — submit plan mapping (pure).
 *
 * SYNC: wired from GlassCompanionProvider auto-submit loop.
 */

import type { GlassCommand } from "./ipc.ts";
import {
  resolveCompanionRoute,
  type CompanionRoute,
} from "./companionRetarget.ts";
import {
  type CompanionMemoryContext,
  type CompanionSessionMemory,
} from "./companionSessionMemory.ts";
import { voiceSubmitPlan } from "./voiceModeActions.ts";
import { tryCompanionScriptAck } from "./companionScriptBridge.ts";

export function companionSubmitPlan(
  transcript: string,
  memory: CompanionSessionMemory | null | undefined,
  ctx: CompanionMemoryContext = {},
): { route: CompanionRoute; commands: GlassCommand[] } {
  const text = transcript.trim();
  if (!text) return { route: "direct_follow_up", commands: [] };

  const route = resolveCompanionRoute(text, memory, ctx);
  return {
    route,
    commands: [
      {
        type: "submit-command",
        text,
        companionRoute: route,
      },
    ],
  };
}

/**
 * Fallback when Companion is off — delegates to Voice Mode routing.
 */
export function companionOrVoiceSubmitPlan(
  transcript: string,
  options: {
    companionActive: boolean;
    memory?: CompanionSessionMemory | null;
    memoryContext?: CompanionMemoryContext;
  },
): { route: string; commands: GlassCommand[] } {
  if (options.companionActive) {
    if (tryCompanionScriptAck(transcript)) {
      return { route: "script_continue", commands: [] };
    }
    const plan = companionSubmitPlan(transcript, options.memory, options.memoryContext);
    return { route: plan.route, commands: plan.commands };
  }
  const voice = voiceSubmitPlan(transcript);
  return { route: voice.route, commands: voice.commands };
}
