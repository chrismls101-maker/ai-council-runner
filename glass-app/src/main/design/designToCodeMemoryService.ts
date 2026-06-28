import type { AletheiaNote } from "../../shared/aletheiaNotes.ts";
import type { GlassProjectRecord } from "../../shared/glassStorageProjectTypes.ts";
import type {
  DesignStack,
  DesignToCodeAction,
  DesignToCodeSession,
} from "../../shared/designToCode.ts";
import type { DesignToCodeMemoryEvent } from "../../shared/design/designToCodeMemoryIngestion.ts";
import { applyDesignToCodeMemoryIngestion } from "../../shared/design/designToCodeMemoryBridge.ts";
import {
  hasRecentMemoryWithTag,
  storeMemory,
  upsertUserContext,
} from "../glassMemoryEngine.ts";

export async function ingestDesignToCodeGlassMemory(input: {
  event: DesignToCodeMemoryEvent;
  session?: DesignToCodeSession;
  stack: DesignStack;
  action: DesignToCodeAction;
  error?: string;
  projects: GlassProjectRecord[];
  notes?: AletheiaNote[];
  explicitRememberText?: string;
  sessionId?: string;
}): Promise<void> {
  try {
    await applyDesignToCodeMemoryIngestion({
      ...input,
      deps: {
        hasRecentMemoryTag: hasRecentMemoryWithTag,
        storeMemory,
        upsertUserContext,
      },
    });
  } catch (err) {
    console.error("[DesignToCode] Glass Memory ingestion error:", err);
  }
}
