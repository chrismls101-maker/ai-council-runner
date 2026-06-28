/** Retention tier for a memory routing contract. */
export type MemoryRetentionTier = "none" | "session" | "short-lived" | "persistent" | "ttl";

export type MemoryRoutingContract = {
  feature: string;
  emitsEphemeralState: boolean;
  emitsEventNotes: boolean;
  emitsProjects: boolean;
  emitsSemanticMemory: boolean;
  emitsRelationshipSignals: boolean;
  ids: {
    sessionId?: boolean;
    runId?: boolean;
    noteId?: boolean;
    projectId?: boolean;
    memoryId?: boolean;
    captureId?: boolean;
    conversationId?: boolean;
  };
  retention: {
    ephemeral: MemoryRetentionTier;
    notes: MemoryRetentionTier;
    projects: MemoryRetentionTier;
    semanticMemory: MemoryRetentionTier;
  };
  recall: {
    askInjection: boolean;
    diagnosticRecall: boolean;
    projectRecallBridge: boolean;
    crossChatRecall: boolean;
  };
};
