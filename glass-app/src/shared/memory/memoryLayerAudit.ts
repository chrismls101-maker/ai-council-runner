/** Cross-layer references for traceable memory events. */
export type MemoryCrossLinks = {
  sessionId?: string;
  runId?: string;
  noteId?: string;
  projectId?: string;
  memoryId?: string;
  captureId?: string;
  conversationId?: string;
  sourceFeature: string;
};

export type MemoryStorageType =
  | "memory"
  | "sqlite"
  | "filesystem"
  | "vector"
  | "cloud"
  | "localStorage";

export type MemoryLayerAuditRow = {
  layer: string;
  storageType: MemoryStorageType;
  survivesRestart: boolean;
  survivesChatBoundary: boolean;
  searchable: boolean;
  semanticSearchable: boolean;
  retentionPolicy: string;
  cleanupTriggers: string[];
  intendedUse: string;
  currentRisks: string[];
  primaryPaths: string[];
};

/** Canonical inventory — keep in sync with MEMORY_ARCHITECTURE.md */
export const MEMORY_LAYER_AUDIT_ROWS: MemoryLayerAuditRow[] = [
  {
    layer: "Glass Memory (vector episodic + user_context)",
    storageType: "vector",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: true,
    semanticSearchable: true,
    retentionPolicy: "90d prune for low-importance episodic; user_fact exempt",
    cleanupTriggers: ["pruneStaleMemories at boot", "pruneHistory"],
    intendedUse: "Long-term patterns and user facts worth semantic recall on asks",
    currentRisks: ["Competes globally in hydrateContext; not feature-scoped by default"],
    primaryPaths: ["src/main/glassMemoryEngine.ts", "src/main/glassMemoryHelpers.ts"],
  },
  {
    layer: "Legacy glass-memory.jsonl",
    storageType: "filesystem",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: true,
    semanticSearchable: false,
    retentionPolicy: "Unbounded append",
    cleanupTriggers: [],
    intendedUse: "Keyword recall of past overlay Q&A pairs",
    currentRisks: ["Parallel to vector memory; duplicate concepts"],
    primaryPaths: ["src/main/glassMemory.ts"],
  },
  {
    layer: "Aletheia notes (aletheia_notes)",
    storageType: "sqlite",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: true,
    semanticSearchable: false,
    retentionPolicy: "Persistent; UI list cap 50 on refresh; no auto DB prune",
    cleanupTriggers: ["Manual delete via dashboard IPC"],
    intendedUse: "That something happened — session observations with optional project links",
    currentRisks: ["General note injection companion-gated except diagnostic path"],
    primaryPaths: ["src/main/aletheiaNotesStore.ts", "src/shared/aletheiaNotes.ts"],
  },
  {
    layer: "Glass Storage Projects",
    storageType: "filesystem",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: true,
    semanticSearchable: false,
    retentionPolicy: "Persistent artifact bundles + projects-index.json",
    cleanupTriggers: ["Manual delete (future); feed item delete does not remove project"],
    intendedUse: "What was saved — Design to Code bundles, manifests, revisions",
    currentRisks: ["Full artifacts not loaded into every ask by design"],
    primaryPaths: [
      "src/main/storage/glassStorageProjectsStore.ts",
      "src/main/design/designToCodeProjectSaver.ts",
    ],
  },
  {
    layer: "Design to Code in-memory captures",
    storageType: "memory",
    survivesRestart: false,
    survivesChatBoundary: false,
    searchable: false,
    semanticSearchable: false,
    retentionPolicy: "Session-only; cleared on feed delete",
    cleanupTriggers: ["App restart", "overlay close", "feed item delete"],
    intendedUse: "Live capture card state and 24h activity summary for asks",
    currentRisks: ["Lost on restart — notes + projects are durable substitute"],
    primaryPaths: ["src/main/design/designToCodeSessionStore.ts"],
  },
  {
    layer: "Companion session memory",
    storageType: "memory",
    survivesRestart: false,
    survivesChatBoundary: false,
    searchable: false,
    semanticSearchable: false,
    retentionPolicy: "30s TTL; 15s capture reuse window",
    cleanupTriggers: ["Companion off", "TTL expiry", "anchor invalidation"],
    intendedUse: "Multi-turn companion routing and capture reuse",
    currentRisks: ["Not a durable recall layer"],
    primaryPaths: ["src/shared/companionSessionMemory.ts"],
  },
  {
    layer: "Aletheia companion sessions + observation snapshots",
    storageType: "sqlite",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: false,
    semanticSearchable: false,
    retentionPolicy: "Persistent rows; observation throttled 60s per session",
    cleanupTriggers: ["Dashboard admin delete sessions"],
    intendedUse: "Companion recap panel and observation history",
    currentRisks: ["Observation only while companion session active"],
    primaryPaths: ["src/main/aletheiaSessionStore.ts", "src/main/aletheiaObservationPlane.ts"],
  },
  {
    layer: "Relationship thread",
    storageType: "memory",
    survivesRestart: false,
    survivesChatBoundary: false,
    searchable: false,
    semanticSearchable: false,
    retentionPolicy: "45min event window; max 24 events",
    cleanupTriggers: ["Companion end", "TTL"],
    intendedUse: "Return brief when user refocuses Glass during companion",
    currentRisks: ["Not durable recall"],
    primaryPaths: ["src/shared/aletheiaRelationshipThread.ts"],
  },
  {
    layer: "Session history (sessions, messages, agent_runs)",
    storageType: "sqlite",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: true,
    semanticSearchable: false,
    retentionPolicy: "90d archived delete; 30d idle archive; agent blob null after 7d",
    cleanupTriggers: ["pruneHistory at boot"],
    intendedUse: "Chat/council history and post-session extraction to Glass Memory",
    currentRisks: ["Large DB triggers 48h blob null + VACUUM at 400MB"],
    primaryPaths: ["src/main/sessionHistoryStore.ts", "src/main/glassMemoryEngine.ts"],
  },
  {
    layer: "Cloud memory vault",
    storageType: "cloud",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: false,
    semanticSearchable: false,
    retentionPolicy: "Server-owned",
    cleanupTriggers: [],
    intendedUse: "User-initiated Remember this evidence upload",
    currentRisks: ["No read-back path in Glass client"],
    primaryPaths: ["src/shared/iivoMemoryClient.ts"],
  },
  {
    layer: "Scrollback (encrypted terminal)",
    storageType: "sqlite",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: true,
    semanticSearchable: false,
    retentionPolicy: "No automatic prune in code",
    cleanupTriggers: [],
    intendedUse: "Terminal command history and NL search handoff",
    currentRisks: ["Separate from Aletheia ask context by default"],
    primaryPaths: ["src/main/scrollbackStore.ts"],
  },
  {
    layer: "Coder project index (.glass-index)",
    storageType: "sqlite",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: true,
    semanticSearchable: true,
    retentionPolicy: "Per-project on disk; Ollama embeddings",
    cleanupTriggers: ["Re-index on workspace change"],
    intendedUse: "Semantic code search for Glass Coder — not Aletheia general memory",
    currentRisks: ["Not linked to D2C or Aletheia notes"],
    primaryPaths: ["src/main/glassIndex.ts"],
  },
  {
    layer: "Renderer workspace sessions (Research / Writing)",
    storageType: "localStorage",
    survivesRestart: true,
    survivesChatBoundary: false,
    searchable: false,
    semanticSearchable: false,
    retentionPolicy: "Browser localStorage in overlay profile",
    cleanupTriggers: ["Clear site data"],
    intendedUse: "In-progress Research/Writing UI sessions",
    currentRisks: ["Not merged into main-process Aletheia recall"],
    primaryPaths: [
      "src/renderer/research/researchSessionStore.ts",
      "src/renderer/writing/writingSessionStore.ts",
    ],
  },
  {
    layer: "Agent output reports (Research / Writing)",
    storageType: "filesystem",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: false,
    semanticSearchable: false,
    retentionPolicy: "Markdown in configured agent output folder (default Desktop)",
    cleanupTriggers: ["Manual delete"],
    intendedUse: "Research intelligence reports and Writing agent documents via write_file",
    currentRisks: ["Not indexed in Glass Storage Projects; not in Aletheia D2C recall"],
    primaryPaths: ["src/main/agents/paths.ts", "src/main/agentRunner.ts"],
  },
  {
    layer: "Wingman session library (wingman-sessions.jsonl)",
    storageType: "filesystem",
    survivesRestart: true,
    survivesChatBoundary: true,
    searchable: true,
    semanticSearchable: false,
    retentionPolicy: "Unbounded JSONL append; user can delete file",
    cleanupTriggers: ["Manual file delete"],
    intendedUse: "Cross-session Wingman recall of past work goals and findings",
    currentRisks: ["Separate from Aletheia ask context; Wingman-only search"],
    primaryPaths: ["src/shared/wingmanMemory.ts", "src/main/index.ts"],
  },
  {
    layer: "Listen / overlay sessions (glass-sessions.json)",
    storageType: "filesystem",
    survivesRestart: true,
    survivesChatBoundary: false,
    searchable: false,
    semanticSearchable: false,
    retentionPolicy: "Persistent JSON; screenshots stripped on write",
    cleanupTriggers: ["Session store prune / user clear"],
    intendedUse: "Listen mode timeline + session intelligence inputs (insights, moments)",
    currentRisks: ["Not wired into Aletheia D2C recall path"],
    primaryPaths: [
      "src/main/sessionPersistence.ts",
      "src/shared/sessionStore.ts",
      "src/shared/sessionIntelligence.ts",
    ],
  },
];
