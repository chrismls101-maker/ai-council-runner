/**
 * Glass ask memory enrichment (main process).
 */

import type { GlassAskRequest } from "../shared/glassAskTypes.ts";
import { passiveContextForAsk } from "./glassAskPrompt.ts";
import { hydrateContext } from "./glassMemoryEngine.ts";

export async function enrichGlassAskRequestWithMemory(
  request: GlassAskRequest,
  agentType = "chat",
): Promise<GlassAskRequest> {
  if (request.memoryContext || request.suppressUserProfile) {
    return request;
  }
  try {
    const memoryContext = await hydrateContext(request.prompt, agentType);
    const userContext = passiveContextForAsk(request.userContext, memoryContext);
    return {
      ...request,
      memoryContext,
      ...(userContext ? { userContext } : { userContext: undefined }),
    };
  } catch (err) {
    console.error("[memory] enrichGlassAskRequestWithMemory:", err);
    return request;
  }
}
