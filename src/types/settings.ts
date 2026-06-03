export interface AppSettings {
  useMemoryInResponses: boolean;
  autoIncludeRelevantMemory: boolean;
  suggestedMemory: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  useMemoryInResponses: true,
  autoIncludeRelevantMemory: true,
  suggestedMemory: true,
};
