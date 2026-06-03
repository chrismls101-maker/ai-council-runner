import { useEffect, useMemo, useState } from "react";
import type { ArtifactSection, IivoArtifact } from "../../types/artifacts";
import type { ArtifactSectionVersion } from "../../types/artifactVersions";
import type {
  ArtifactTransformType,
  BuilderContextItem,
  BuilderWorkspaceTab,
  SectionVariantType,
} from "../../types/builderWorkspace";
import type { VersionPersistenceMode } from "../../utils/artifactApi";
import { buildArtifactMap } from "../../utils/buildMap";
import { scoreArtifactQuality } from "../../utils/artifactQuality";
import ArtifactRenderer from "../artifacts/ArtifactRenderer";
import BuilderLoadingIcon from "./BuilderLoadingIcon";
import BuilderRightPanel from "./BuilderRightPanel";
import BuilderSidebar from "./BuilderSidebar";
import BuilderToolbar from "./BuilderToolbar";
import type { RelatedChild } from "./RelatedArtifactsPanel";
import VersionCompareModal from "./VersionCompareModal";

export interface BuilderCanvasProps {
  artifact: IivoArtifact;
  rootArtifact: IivoArtifact;
  runId?: string | null;
  loading?: boolean;
  activeTab?: BuilderWorkspaceTab;
  onTabChange?: (tab: BuilderWorkspaceTab) => void;
  onBackToChat: () => void;
  onFeedback?: (message: string) => void;
  onRegenerateSection?: (section: ArtifactSection, options?: { variantType?: SectionVariantType }) => void;
  onEditSection?: (section: ArtifactSection) => void;
  onTransform?: (transformType: ArtifactTransformType) => void;
  onApplyFix?: (fixId: string, targetSectionId?: string) => void;
  onRestoreVersion?: (versionId: string) => void;
  onCompareVersion?: (versionId: string) => void;
  compareVersionId?: string | null;
  onCloseCompare?: () => void;
  relatedChildren?: RelatedChild[];
  lastTransformLabel?: string;
  onOpenChild?: (childId: string) => void;
  onOpenChildInBuilder?: (childId: string) => void;
  onKeepOriginal?: () => void;
  loadingSectionId?: string | null;
  transformLoading?: boolean;
  contextItems?: BuilderContextItem[];
  versionState?: Record<string, ArtifactSectionVersion[]>;
  ignoredFixes?: Set<string>;
  onIgnoreFix?: (fixId: string) => void;
  traceSummary?: string;
  onSavedChange?: (saved: boolean) => void;
  onShareAction?: (action: string) => void;
  onBuilderTraceUpdate?: (patch: {
    activeTab?: BuilderWorkspaceTab;
    buildMapCompleteness?: number;
    qualityScore?: number;
    suggestedFixCount?: number;
    versionCount?: number;
    versionPersistence?: VersionPersistenceMode;
  }) => void;
  userPrompt?: string;
  onAttachVisual?: (artifact: IivoArtifact) => void;
}

export default function BuilderCanvas({
  artifact,
  rootArtifact,
  runId,
  loading = false,
  activeTab: activeTabProp,
  onTabChange,
  onBackToChat,
  onFeedback,
  onRegenerateSection,
  onEditSection,
  onTransform,
  onApplyFix,
  onRestoreVersion,
  onCompareVersion,
  compareVersionId,
  onCloseCompare,
  relatedChildren = [],
  lastTransformLabel,
  onOpenChild,
  onOpenChildInBuilder,
  onKeepOriginal,
  loadingSectionId,
  transformLoading = false,
  contextItems = [],
  versionState = {},
  ignoredFixes = new Set(),
  onIgnoreFix,
  traceSummary,
  onSavedChange,
  onShareAction,
  onBuilderTraceUpdate,
  userPrompt,
  onAttachVisual,
}: BuilderCanvasProps) {
  const [showContent, setShowContent] = useState(!loading);
  const [internalTab, setInternalTab] = useState<BuilderWorkspaceTab>("compose");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    artifact.sections[0]?.id ?? null,
  );

  const activeTab = activeTabProp ?? internalTab;
  const setActiveTab = (tab: BuilderWorkspaceTab) => {
    if (onTabChange) onTabChange(tab);
    else setInternalTab(tab);
  };

  const buildMap = useMemo(
    () => buildArtifactMap(artifact.type, artifact.title, artifact.sections),
    [artifact],
  );
  const quality = useMemo(
    () => scoreArtifactQuality(artifact.type, artifact.sections),
    [artifact],
  );

  const versionCount = useMemo(
    () => Object.values(versionState).reduce((n, arr) => n + arr.length, 0),
    [versionState],
  );

  const compareVersion = compareVersionId
    ? Object.values(versionState)
        .flat()
        .find((v) => v.id === compareVersionId)
    : undefined;
  const compareSection = compareVersion
    ? artifact.sections.find((s) => s.id === compareVersion.sectionId)
    : undefined;

  useEffect(() => {
    onBuilderTraceUpdate?.({
      activeTab,
      buildMapCompleteness: buildMap.overallCompleteness,
      qualityScore: quality.overall,
      suggestedFixCount: quality.suggestedFixes.length,
      versionCount,
    });
  }, [activeTab, buildMap, quality, versionCount, onBuilderTraceUpdate]);

  useEffect(() => {
    setSelectedSectionId(artifact.sections[0]?.id ?? null);
  }, [artifact.id]);

  useEffect(() => {
    if (!loading) {
      setShowContent(true);
      return;
    }
    setShowContent(false);
    const timer = window.setTimeout(() => setShowContent(true), 600);
    return () => window.clearTimeout(timer);
  }, [loading, artifact.id]);

  const resolveSection = (sectionId: string) =>
    artifact.sections.find((s) => s.id === sectionId);

  const handleRegenerateById = (sectionId: string, variantType?: SectionVariantType) => {
    const section = resolveSection(sectionId);
    if (section && onRegenerateSection) {
      onRegenerateSection(section, variantType ? { variantType } : undefined);
    }
  };

  const handleEditById = (sectionId: string) => {
    const section = resolveSection(sectionId);
    if (section && onEditSection) onEditSection(section);
  };

  const handleApplyFix = (fixId: string, targetSectionId?: string) => {
    if (onApplyFix) {
      onApplyFix(fixId, targetSectionId);
      return;
    }
    if (targetSectionId) {
      handleRegenerateById(targetSectionId);
      return;
    }
    const fix = quality.suggestedFixes.find((f) => f.id === fixId);
    if (fix?.targetSectionId) handleRegenerateById(fix.targetSectionId);
    else if (artifact.sections[0]) handleRegenerateById(artifact.sections[0].id);
  };

  const viewingChild = artifact.id !== rootArtifact.id;

  return (
    <div className="builder-workspace" data-testid="builder-canvas">
      {viewingChild && (
        <div className="builder-focus-breadcrumb muted" data-testid="builder-focus-breadcrumb">
          <button type="button" className="btn ghost small" onClick={() => onKeepOriginal?.()}>
            ← Back to {rootArtifact.title}
          </button>
          <span>
            Viewing: {artifact.title}
          </span>
        </div>
      )}
      <BuilderToolbar
        artifact={artifact}
        runId={runId}
        onBackToChat={onBackToChat}
        onFeedback={onFeedback}
        onSavedChange={onSavedChange}
        onShareAction={onShareAction}
      />
      <div className="builder-workspace-main">
        <BuilderSidebar
          sections={artifact.sections}
          buildMap={buildMap}
          selectedSectionId={selectedSectionId}
          onSelectSection={(id) => {
            setSelectedSectionId(id);
            const el = document.getElementById(`artifact-section-${id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <div className="builder-canvas-center">
          <div className="builder-canvas-body">
            {loading && !showContent ? (
              <BuilderLoadingIcon />
            ) : (
              <ArtifactRenderer
                artifact={artifact}
                onFeedback={onFeedback}
                onRegenerateSection={onRegenerateSection}
                onEditSection={onEditSection}
                loadingSectionId={loadingSectionId}
              />
            )}
          </div>
        </div>
        <BuilderRightPanel
          artifact={artifact}
          rootArtifact={rootArtifact}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          buildMap={buildMap}
          quality={quality}
          contextItems={contextItems}
          selectedSectionId={selectedSectionId}
          versionState={versionState}
          ignoredFixes={ignoredFixes}
          relatedChildren={relatedChildren}
          lastTransformLabel={lastTransformLabel}
          onOpenChild={onOpenChild}
          onOpenChildInBuilder={onOpenChildInBuilder}
          onKeepOriginal={onKeepOriginal}
          onSelectSection={setSelectedSectionId}
          onAddSection={(id) => handleRegenerateById(id)}
          onImproveSection={(id) => {
            setSelectedSectionId(id);
            setActiveTab("improve");
          }}
          onApplyFix={handleApplyFix}
          onIgnoreFix={(id) => onIgnoreFix?.(id)}
          onRegenerateFix={handleApplyFix}
          onVariant={(id, variant) => handleRegenerateById(id, variant)}
          onRegenerateSection={handleRegenerateById}
          onEditSection={handleEditById}
          onRestoreVersion={(id) => onRestoreVersion?.(id)}
          onCompareVersion={(id) => onCompareVersion?.(id)}
          onFeedback={onFeedback}
          onTransform={(t) => onTransform?.(t)}
          sectionLoading={Boolean(loadingSectionId)}
          transformLoading={transformLoading}
          traceSummary={traceSummary}
          userPrompt={userPrompt}
          onAttachVisual={onAttachVisual}
        />
      </div>
      {compareVersion && compareSection && (
        <VersionCompareModal
          open
          version={compareVersion}
          currentSection={compareSection}
          onClose={() => onCloseCompare?.()}
          onRestore={(id) => {
            onRestoreVersion?.(id);
            onCloseCompare?.();
          }}
          onCopyVersion={() => onFeedback?.("Version copied")}
        />
      )}
    </div>
  );
}
