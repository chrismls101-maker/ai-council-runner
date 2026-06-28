import type { MemoryRoutingContract } from "./memoryRoutingContract.ts";

export const MEMORY_FEATURE_REGISTRY: MemoryRoutingContract[] = [
  {
    feature: "design-to-code",
    emitsEphemeralState: true,
    emitsEventNotes: true,
    emitsProjects: true,
    emitsSemanticMemory: true,
    emitsRelationshipSignals: false,
    ids: {
      sessionId: true,
      noteId: true,
      projectId: true,
      captureId: true,
      memoryId: true,
    },
    retention: {
      ephemeral: "session",
      notes: "persistent",
      projects: "persistent",
      semanticMemory: "persistent",
    },
    recall: {
      askInjection: true,
      diagnosticRecall: true,
      projectRecallBridge: true,
      crossChatRecall: true,
    },
  },
  {
    feature: "aletheia-computer-operator",
    emitsEphemeralState: true,
    emitsEventNotes: true,
    emitsProjects: false,
    emitsSemanticMemory: false,
    emitsRelationshipSignals: false,
    ids: {
      sessionId: true,
      noteId: true,
      runId: true,
    },
    retention: {
      ephemeral: "session",
      notes: "persistent",
      projects: "none",
      semanticMemory: "none",
    },
    recall: {
      askInjection: true,
      diagnosticRecall: true,
      projectRecallBridge: false,
      crossChatRecall: true,
    },
  },
  /** Agent markdown reports via write_file — agent output folder, not Glass Storage Projects index. */
  {
    feature: "aletheia-research",
    emitsEphemeralState: true,
    emitsEventNotes: true,
    emitsProjects: true,
    emitsSemanticMemory: false,
    emitsRelationshipSignals: false,
    ids: {
      sessionId: true,
      noteId: true,
    },
    retention: {
      ephemeral: "session",
      notes: "persistent",
      projects: "persistent",
      semanticMemory: "none",
    },
    recall: {
      askInjection: true,
      diagnosticRecall: false,
      projectRecallBridge: false,
      crossChatRecall: false,
    },
  },
  /** Agent markdown documents via write_file — agent output folder, not Glass Storage Projects index. */
  {
    feature: "writing-studio",
    emitsEphemeralState: true,
    emitsEventNotes: true,
    emitsProjects: true,
    emitsSemanticMemory: false,
    emitsRelationshipSignals: false,
    ids: {
      sessionId: true,
      noteId: true,
    },
    retention: {
      ephemeral: "session",
      notes: "persistent",
      projects: "persistent",
      semanticMemory: "none",
    },
    recall: {
      askInjection: true,
      diagnosticRecall: false,
      projectRecallBridge: false,
      crossChatRecall: false,
    },
  },
  {
    feature: "glass-coder-agents",
    emitsEphemeralState: true,
    emitsEventNotes: false,
    emitsProjects: false,
    emitsSemanticMemory: true,
    emitsRelationshipSignals: false,
    ids: {
      sessionId: true,
      runId: true,
    },
    retention: {
      ephemeral: "session",
      notes: "none",
      projects: "none",
      semanticMemory: "persistent",
    },
    recall: {
      askInjection: true,
      diagnosticRecall: false,
      projectRecallBridge: false,
      crossChatRecall: true,
    },
  },
  {
    feature: "council-sessions",
    emitsEphemeralState: false,
    emitsEventNotes: false,
    emitsProjects: false,
    emitsSemanticMemory: true,
    emitsRelationshipSignals: false,
    ids: {
      sessionId: true,
      conversationId: true,
    },
    retention: {
      ephemeral: "none",
      notes: "none",
      projects: "none",
      semanticMemory: "persistent",
    },
    recall: {
      askInjection: true,
      diagnosticRecall: false,
      projectRecallBridge: false,
      crossChatRecall: true,
    },
  },
  {
    feature: "companion",
    emitsEphemeralState: true,
    emitsEventNotes: true,
    emitsProjects: false,
    emitsSemanticMemory: false,
    emitsRelationshipSignals: true,
    ids: {
      sessionId: true,
      noteId: true,
    },
    retention: {
      ephemeral: "short-lived",
      notes: "persistent",
      projects: "none",
      semanticMemory: "none",
    },
    recall: {
      askInjection: true,
      diagnosticRecall: true,
      projectRecallBridge: false,
      crossChatRecall: true,
    },
  },
];

export function memoryContractForFeature(feature: string): MemoryRoutingContract | undefined {
  return MEMORY_FEATURE_REGISTRY.find((c) => c.feature === feature);
}
