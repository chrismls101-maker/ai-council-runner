/**
 * Glass Pathways — canonical runtime types (see docs/architecture/GLASS_PATHWAYS.md).
 */

export type PathwayId = string;
export type StageId = string;
export type StepId = string;
export type CheckpointId = string;
export type ReceiptId = string;
export type GateId = string;
export type HandoffId = string;

export type PathwayDomain =
  | "app_launch"
  | "startup"
  | "course"
  | "book"
  | "career_switch"
  | "move"
  | "wedding"
  | "custom";

export type PathwayStatus =
  | "drafting"
  | "awaiting_confirmation"
  | "ready"
  | "active"
  | "paused"
  | "awaiting_input"
  | "awaiting_approval"
  | "privacy_handoff"
  | "operator_running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type StageStatus =
  | "pending"
  | "ready"
  | "active"
  | "awaiting_input"
  | "awaiting_approval"
  | "privacy_handoff"
  | "completed"
  | "blocked"
  | "skipped"
  | "failed";

export type StepStatus =
  | "pending"
  | "ready"
  | "active"
  | "running_research"
  | "running_operator"
  | "awaiting_input"
  | "awaiting_approval"
  | "privacy_handoff"
  | "completed"
  | "failed"
  | "cancelled";

export type StepMode =
  | "guide"
  | "research"
  | "escort"
  | "privacy"
  | "operator";

export type RiskLevel =
  | "read_safe"
  | "advisory"
  | "navigational"
  | "write_requires_confirmation"
  | "sensitive_private"
  | "destructive";

export type ResumeTrigger =
  | "voice_phrase"
  | "manual_resume_button"
  | "explicit_text_reply"
  | "stage_reopen";

export interface CompletionCriterion {
  id: string;
  description: string;
  required: boolean;
}

export interface RequiredInput {
  id: string;
  label: string;
  kind: "text" | "choice" | "file" | "credential_hint" | "confirmation";
  options?: string[];
  required: boolean;
}

export interface ToolPlan {
  connectorId?: string;
  agentId?: string;
  readOnly: boolean;
  actionSummary: string;
}

export interface OperatorPlan {
  goal: string;
  scopeLines: string[];
  maxSteps?: number;
  forbiddenPatterns?: string[];
}

export interface ArtifactRef {
  id: string;
  title: string;
  kind: "note" | "file" | "link" | "decision" | "screenshot_ref";
  ref?: string;
  createdAt: string;
}

export interface OpenQuestion {
  id: string;
  stageId?: StageId;
  question: string;
  blocking: boolean;
  createdAt: string;
}

export interface CredentialHint {
  id: string;
  service: string;
  scope: string;
  label: string;
}

export interface LinkedApp {
  id: string;
  name: string;
  bundleId?: string;
  lastFocusedAt?: string;
}

export interface WorkflowError {
  code: string;
  message: string;
  recoverable: boolean;
  stageId?: StageId;
  stepId?: StepId;
}

export interface ResourceRef {
  id: string;
  title: string;
  url: string;
  category:
    | "market_research"
    | "benchmark"
    | "tutorial"
    | "registration"
    | "pricing"
    | "compliance"
    | "distribution"
    | "community"
    | "reference";
  whyRelevant: string;
}

export interface ToolRef {
  id: string;
  name: string;
  category:
    | "research"
    | "analytics"
    | "design"
    | "payments"
    | "distribution"
    | "legal"
    | "productivity"
    | "connector";
  whyRelevant: string;
  accessMode: "web" | "connector" | "desktop_app" | "local";
}

export interface GatePolicy {
  requiresApproval: boolean;
  approvalOnRiskLevels: RiskLevel[];
  expiresAfterMinutes?: number;
}

export interface PrivacyPolicy {
  requiresPrivacyMode: boolean;
  triggerOnCredentialEntry: boolean;
  triggerOnPaymentEntry: boolean;
  triggerOnIdentityVerification: boolean;
  triggerOnSensitiveDocs: boolean;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  failTo: "awaiting_input" | "blocked" | "failed";
}

export interface TargetContext {
  appName?: string;
  siteUrl?: string;
  pageHint?: string;
  targetEntity?: string;
}

export interface StageDependency {
  kind: "stage" | "decision" | "artifact" | "credential" | "approval";
  refId: string;
  description: string;
  required: boolean;
}

export interface Step {
  id: StepId;
  stageId: StageId;
  index: number;
  title: string;
  description: string;
  status: StepStatus;
  mode: StepMode;
  riskLevel: RiskLevel;
  targetContext?: TargetContext;
  requiredUserInputs: RequiredInput[];
  toolPlan?: ToolPlan;
  operatorPlan?: OperatorPlan;
  outputArtifacts: ArtifactRef[];
  gatePolicy: GatePolicy;
  privacyPolicy: PrivacyPolicy;
  retryPolicy: RetryPolicy;
  lastError?: WorkflowError;
  startedAt?: string;
  completedAt?: string;
}

export interface Stage {
  id: StageId;
  pathwayId: PathwayId;
  index: number;
  title: string;
  objective: string;
  whyItMatters: string;
  status: StageStatus;
  inputsNeeded: string[];
  outputsRequired: string[];
  dependencies: StageDependency[];
  commonMistakes: string[];
  suggestedResources: ResourceRef[];
  suggestedTools: ToolRef[];
  completionCriteria: CompletionCriterion[];
  privacySensitivity: "low" | "medium" | "high";
  stepIds: StepId[];
  startedAt?: string;
  completedAt?: string;
  /** Generation richness — mirrored into steps at parse time. */
  whatToReview?: string[];
  alethiaHelp?: string[];
  userActions?: string[];
  substepDone?: boolean[];
}

export interface DecisionRecord {
  id: string;
  stageId: StageId;
  decision: string;
  rationale?: string;
  chosenOption?: string;
  alternatives?: string[];
  timestamp: string;
}

export interface PathwayContext {
  userGoal: string;
  inferredIntent?: string;
  currentNarrative: string;
  domainFacts: Record<string, unknown>;
  decisionsMade: DecisionRecord[];
  openQuestions: OpenQuestion[];
  knownCredentials: CredentialHint[];
  linkedApps: LinkedApp[];
  discoveredResources: ResourceRef[];
  artifacts: ArtifactRef[];
  notes: string[];
}

export interface PathwayCapabilities {
  allowResearch: boolean;
  allowEscort: boolean;
  allowOperator: boolean;
  allowConnectors: boolean;
  allowVoiceResume: boolean;
  allowPrivacyHandoff: boolean;
  allowAutoAdvanceStages: boolean;
  operatorGrantMode: "per_step" | "session" | "always_allow";
}

export interface ProposedAction {
  kind:
    | "research_query"
    | "open_site"
    | "focus_app"
    | "connector_call"
    | "computer_click"
    | "computer_type"
    | "file_write"
    | "external_submit";
  summary: string;
  scope?: string;
}

export interface ApprovalGate {
  id: GateId;
  pathwayId: PathwayId;
  stageId: StageId;
  stepId: StepId;
  reason: string;
  requestedAction: ProposedAction[];
  riskLevel: RiskLevel;
  state: "pending" | "approved" | "rejected" | "expired";
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface PrivacyHandoff {
  id: HandoffId;
  pathwayId: PathwayId;
  stageId: StageId;
  stepId: StepId;
  reason: string;
  suspendObservation: boolean;
  suspendActions: boolean;
  expectedUserTask: string;
  resumePhrases: string[];
  state: "pending" | "active" | "resumed" | "cancelled";
  enteredAt: string;
  resumedAt?: string;
}

export interface Checkpoint {
  id: CheckpointId;
  pathwayId: PathwayId;
  stageId: StageId | null;
  stepId: StepId | null;
  statusSnapshot: {
    pathwayStatus: PathwayStatus;
    stageStatus?: StageStatus;
    stepStatus?: StepStatus;
  };
  contextSnapshot: PathwayContext;
  pendingGateId?: GateId;
  pendingHandoffId?: HandoffId;
  createdAt: string;
  reason:
    | "before_gate"
    | "before_operator_run"
    | "before_privacy_handoff"
    | "after_step_complete"
    | "manual_pause"
    | "failure_recovery";
  note?: string;
}

export type ExecutionReceiptKind =
  | "pathway_created"
  | "stage_started"
  | "stage_completed"
  | "step_started"
  | "step_completed"
  | "research_performed"
  | "resource_discovered"
  | "gate_requested"
  | "gate_approved"
  | "gate_rejected"
  | "privacy_handoff_entered"
  | "privacy_handoff_resumed"
  | "operator_started"
  | "operator_completed"
  | "checkpoint_created"
  | "pathway_paused"
  | "pathway_resumed"
  | "pathway_completed"
  | "pathway_failed";

export interface ExecutionReceipt {
  id: ReceiptId;
  pathwayId: PathwayId;
  stageId?: StageId;
  stepId?: StepId;
  kind: ExecutionReceiptKind;
  summary: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface Pathway {
  id: PathwayId;
  goal: string;
  domain: PathwayDomain;
  title: string;
  summary: string;
  status: PathwayStatus;
  currentStageId: StageId | null;
  currentStepId: StepId | null;
  stages: Stage[];
  steps: Step[];
  context: PathwayContext;
  capabilities: PathwayCapabilities;
  audit: ExecutionReceipt[];
  checkpoints: Checkpoint[];
  pendingGate: ApprovalGate | null;
  pendingHandoff: PrivacyHandoff | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** @deprecated Use audit — kept for migration reads. */
export type PathwayReceiptKind =
  | "escort"
  | "privacy_start"
  | "privacy_end"
  | "execution_start"
  | "execution_end"
  | "connector"
  | "observe"
  | "checkpoint"
  | "stage_active"
  | "stage_complete";

/** @deprecated Use ExecutionReceipt — kept for migration reads. */
export interface PathwayRuntimeReceipt {
  id: string;
  pathwayId: string;
  stageId: string;
  kind: PathwayReceiptKind;
  label: string;
  detail?: string;
  at: string;
}

export type GlassPathway = Pathway;
export type GlassPathwayStage = Stage;

export type WorkflowEvent =
  | { type: "PATHWAY_CREATED"; pathway: Pathway }
  | { type: "PATHWAY_CONFIRMED"; pathwayId: PathwayId }
  | { type: "STAGE_START"; pathwayId: PathwayId; stageId: StageId }
  | { type: "STEP_START"; pathwayId: PathwayId; stageId: StageId; stepId: StepId }
  | { type: "STEP_COMPLETE"; pathwayId: PathwayId; stageId: StageId; stepId: StepId }
  | { type: "RESOURCE_DISCOVERED"; pathwayId: PathwayId; stageId: StageId; resource: ResourceRef }
  | { type: "APPROVAL_REQUESTED"; gate: ApprovalGate }
  | { type: "APPROVAL_RESOLVED"; gateId: GateId; resolution: "approved" | "rejected" }
  | { type: "PRIVACY_HANDOFF_ENTER"; handoff: PrivacyHandoff }
  | { type: "PRIVACY_HANDOFF_RESUME"; handoffId: HandoffId; trigger: ResumeTrigger }
  | { type: "OPERATOR_RUN_REQUESTED"; pathwayId: PathwayId; stepId: StepId }
  | { type: "OPERATOR_RUN_COMPLETED"; pathwayId: PathwayId; stepId: StepId }
  | { type: "CHECKPOINT_CREATE"; pathwayId: PathwayId; stageId: StageId; stepId?: StepId; reason: Checkpoint["reason"]; note?: string }
  | { type: "PATHWAY_PAUSE"; pathwayId: PathwayId }
  | { type: "PATHWAY_RESUME"; pathwayId: PathwayId }
  | { type: "PATHWAY_COMPLETE"; pathwayId: PathwayId }
  | { type: "PATHWAY_FAIL"; pathwayId: PathwayId; error: WorkflowError };

/** Transient session while escort/privacy/operator modes run (UI bridge until step runners own mode). */
export type PathwayLiveSessionMode = "escort" | "privacy" | "execution" | "connector" | "observe";

export interface PathwayLiveSession {
  pathwayId: string;
  stageId: string;
  stepId?: string;
  mode: PathwayLiveSessionMode;
  targetLabel?: string;
  privacyReason?: string;
  executionGoal?: string;
  connectorId?: string;
  startedAt: string;
}

/** Raw stage shape from model JSON (ids/status optional). */
export interface GeneratedPathwayStage {
  id?: string;
  index?: number;
  title: string;
  objective: string;
  whyItMatters: string;
  whatToReview?: string[];
  commonMistakes?: string[];
  alethiaHelp?: string[];
  userActions?: string[];
  completionCriteria?: string[];
  status?: StageStatus;
}

/** Raw pathway shape from model JSON. */
export interface GeneratedPathwayPayload {
  title: string;
  summary: string;
  domain: string;
  stages: GeneratedPathwayStage[];
}

export interface GlassPathwaysGenerateRequest {
  goal: string;
}

export interface GlassPathwaysGenerateResponse {
  pathway?: Pathway;
  error?: string;
}

export type PathwayStageGuidanceMode = "explain" | "stuck";

export interface GlassPathwaysStageGuidanceRequest {
  pathway: Pathway;
  stageId: string;
  mode: PathwayStageGuidanceMode;
}

export interface GlassPathwaysStageGuidanceResponse {
  answer?: string;
  error?: string;
}

export interface GlassPathwaysEscortLaunchRequest {
  kind: "url" | "settings";
  destination: string;
}

export interface GlassPathwaysEscortLaunchResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

export type SpacesMode = "glass-pathways";

export const SPACES_MODES: readonly { id: SpacesMode; label: string }[] = [
  { id: "glass-pathways", label: "Glass Pathways" },
] as const;

/** Map legacy prompt domain hints to canonical PathwayDomain. */
export function normalizePathwayDomain(domain: string): PathwayDomain {
  const d = domain.trim().toLowerCase().replace(/-/g, "_");
  const map: Record<string, PathwayDomain> = {
    app_launch: "app_launch",
    "app-launch": "app_launch",
    startup: "startup",
    course: "course",
    book: "book",
    career: "career_switch",
    career_switch: "career_switch",
    move: "move",
    wedding: "wedding",
    life_event: "wedding",
    brand_launch: "startup",
    general: "custom",
    custom: "custom",
  };
  return map[d] ?? "custom";
}

export function stepsForStage(pathway: Pathway, stageId: StageId): Step[] {
  const stage = pathway.stages.find((s) => s.id === stageId);
  if (!stage) return [];
  return stage.stepIds
    .map((id) => pathway.steps.find((step) => step.id === id))
    .filter((step): step is Step => step != null)
    .sort((a, b) => a.index - b.index);
}

export function findStep(pathway: Pathway, stepId: StepId): Step | null {
  return pathway.steps.find((s) => s.id === stepId) ?? null;
}

export function findStage(pathway: Pathway, stageId: StageId): Stage | null {
  return pathway.stages.find((s) => s.id === stageId) ?? null;
}

export function stageUserActions(stage: Stage): string[] {
  if (stage.userActions && stage.userActions.length > 0) return stage.userActions;
  return stage.completionCriteria.map((c) => c.description);
}

export function stageCompletionStrings(stage: Stage): string[] {
  if (stage.completionCriteria.length > 0) {
    return stage.completionCriteria.map((c) => c.description);
  }
  return [];
}
