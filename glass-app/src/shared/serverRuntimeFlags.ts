export type ServerRuntimeFlags = {
  overlayDemoEnabled: boolean;
  terminalAutoFixEnabled: boolean;
  coderBuildLoopEnabledForNewUsers: boolean;
  aiCallsEnabled: boolean;
  /**
   * Controls whether companion mode auto-activates when an agent starts.
   * Default: false — off for all public builds.
   * Must be explicitly enabled by the server config (gated behind trust
   * and user consent). See enableCompanionModeForAgent() in index.ts.
   */
  agentsAutoActivate: boolean;
  /**
   * When true, hides power-user strip tabs (API Keys, Spend) for public/minimal mode.
   * Dev/founder mode overrides. Default: false.
   */
  minimalPublic: boolean;
  updatedAt: string;
};
