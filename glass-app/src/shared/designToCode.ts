/**
 * Re-export barrel — preserves existing import paths.
 */

export type {
  DesignToCodeAction,
  DesignStack,
  DesignToCodeContext,
  ImportedFileContext,
  DesignScreenSpec,
  CodebaseStylePack,
  DesignCaptureQuality,
  DesignCaptureQualityIssue,
  DesignToCodeSession,
  DesignToCodePhase,
  DesignGenerationInput,
  DesignVerificationResult,
} from "./design/designToCodeTypes.ts";

export {
  DEFAULT_DESIGN_STACK,
  DESIGN_STACK_LABELS,
  DESIGN_STACK_EXTENSIONS,
  DESIGN_TO_CODE_ACTION_LABELS,
  getActionLabel,
  stackHint,
  langTagFor,
} from "./design/designStackRegistry.ts";

export { EDITOR_APP_NAMES, isEditorAppName } from "./design/designEditorDetection.ts";

export {
  buildDesignToCodePrompt,
  buildSharedVisionPreamble,
  buildDesignScreenSpecPrompt,
  buildGenerationPrompt,
  buildVerifierPrompt,
  buildRepairPrompt,
  buildRefinementPrompt,
  SHARED_VISION_PREAMBLE_FIRST_LINE,
} from "./design/designPromptBuilders.ts";

export {
  parseDesignScreenSpec,
  createFallbackDesignScreenSpec,
  serializeScreenSpecForPrompt,
} from "./design/designScreenSpecSchema.ts";

export {
  normalizeDesignPhase,
  isDesignPhaseWorking,
  isCodeGeneratingAction,
  shouldTriggerDesignRepair,
} from "./design/designToCodeTypes.ts";
