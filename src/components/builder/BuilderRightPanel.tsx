import { useMemo } from "react";
import type { ArtifactSection, IivoArtifact } from "../../types/artifacts";
import type { ArtifactSectionVersion } from "../../types/artifactVersions";
import type { ArtifactTransformType, BuilderContextItem, BuilderWorkspaceTab, SectionVariantType } from "../../types/builderWorkspace";
import type { ArtifactQualityScore } from "../../utils/artifactQuality";
import type { BuildMap } from "../../utils/buildMap";
import { getPackageActions } from "../../utils/builderPackageActions";
import { artifactFullText, copyText, downloadTextFile, sectionPlainText, tableToCsv } from "../../utils/artifactClipboard";
import { downloadArtifactPdf } from "../../utils/artifactPdf";
import type { ArtifactTable } from "../../types/artifacts";
import ArtifactQualityPanel from "./ArtifactQualityPanel";
import BuildMapPanel from "./BuildMapPanel";
import BuilderContextPanel from "./BuilderContextPanel";
import BuilderTabs from "./BuilderTabs";
import ExecutePanel from "./ExecutePanel";
import SectionVariantMenu from "./SectionVariantMenu";
import RelatedArtifactsPanel, { type RelatedChild } from "./RelatedArtifactsPanel";
import VersionHistoryPanel from "./VersionHistoryPanel";

export interface BuilderRightPanelProps {
  artifact: IivoArtifact;
  rootArtifact: IivoArtifact;
  activeTab: BuilderWorkspaceTab;
  onTabChange: (tab: BuilderWorkspaceTab) => void;
  buildMap: BuildMap;
  quality: ArtifactQualityScore;
  contextItems: BuilderContextItem[];
  selectedSectionId?: string | null;
  versionState: Record<string, ArtifactSectionVersion[]>;
  ignoredFixes: Set<string>;
  onSelectSection: (sectionId: string) => void;
  onAddSection: (sectionId: string) => void;
  onImproveSection: (sectionId: string) => void;
  onApplyFix: (fixId: string, targetSectionId?: string) => void;
  onIgnoreFix: (fixId: string) => void;
  onRegenerateFix: (fixId: string, targetSectionId?: string) => void;
  onVariant: (sectionId: string, variantType: SectionVariantType) => void;
  onRegenerateSection: (sectionId: string) => void;
  onEditSection: (sectionId: string) => void;
  onRestoreVersion: (versionId: string) => void;
  onCompareVersion: (versionId: string) => void;
  onTransform: (transformType: ArtifactTransformType) => void;
  relatedChildren?: RelatedChild[];
  lastTransformLabel?: string;
  onOpenChild?: (childId: string) => void;
  onOpenChildInBuilder?: (childId: string) => void;
  onKeepOriginal?: () => void;
  onFeedback?: (message: string) => void;
  sectionLoading?: boolean;
  transformLoading?: boolean;
  traceSummary?: string;
}

export default function BuilderRightPanel({
  artifact,
  rootArtifact,
  activeTab,
  onTabChange,
  buildMap,
  quality,
  contextItems,
  selectedSectionId,
  versionState,
  ignoredFixes,
  onSelectSection,
  onAddSection,
  onImproveSection,
  onApplyFix,
  onIgnoreFix,
  onRegenerateFix,
  onVariant,
  onRegenerateSection,
  onEditSection,
  onRestoreVersion,
  onCompareVersion,
  onTransform,
  relatedChildren = [],
  lastTransformLabel,
  onOpenChild,
  onOpenChildInBuilder,
  onKeepOriginal,
  onFeedback,
  sectionLoading = false,
  transformLoading = false,
  traceSummary,
}: BuilderRightPanelProps) {
  const notify = (msg: string) => onFeedback?.(msg);
  const selectedSection = artifact.sections.find((s) => s.id === selectedSectionId);
  const packageActions = useMemo(() => getPackageActions(artifact), [artifact]);

  const visibleFixes = quality.suggestedFixes.filter((f) => !ignoredFixes.has(f.id));

  const runPackageAction = async (actionId: string) => {
    const pkg = packageActions.find((p) => p.id === actionId);
    if (!pkg) return;

    switch (pkg.action) {
      case "copy":
        await copyText(artifactFullText(artifact));
        notify("Copied");
        break;
      case "copy_subject": {
        const sub = artifact.sections.find((s) => /subject/i.test(s.label));
        if (sub) await copyText(sectionPlainText(sub));
        notify("Subject copied");
        break;
      }
      case "copy_body": {
        const body = artifact.sections.find(
          (s) => s.kind === "email_body" || /body/i.test(s.label),
        );
        if (body) await copyText(sectionPlainText(body));
        notify("Body copied");
        break;
      }
      case "copy_followup": {
        const fu = artifact.sections.find((s) => /follow/i.test(s.label));
        if (fu) await copyText(sectionPlainText(fu));
        notify("Follow-up copied");
        break;
      }
      case "download_txt":
        downloadTextFile(`${artifact.type}.txt`, artifactFullText(artifact));
        notify("Downloaded");
        break;
      case "download_md":
        downloadTextFile(`${artifact.type}.md`, artifactFullText(artifact), "text/markdown");
        notify("Exported");
        break;
      case "download_csv": {
        const table = artifact.sections.find((s) => s.kind === "table");
        if (table && typeof table.content !== "string") {
          downloadTextFile(
            `${artifact.type}.csv`,
            tableToCsv(table.content as ArtifactTable),
            "text/csv",
          );
          notify("CSV downloaded");
        }
        break;
      }
      case "download_pdf":
        downloadArtifactPdf(artifact);
        notify("PDF downloaded");
        break;
      default:
        notify("Copied");
    }
  };

  return (
    <aside className="builder-right-panel" data-testid="builder-right-panel">
      <BuilderTabs activeTab={activeTab} onTabChange={onTabChange} />
      <div className="builder-panel-body" data-testid={`builder-panel-${activeTab}`}>
        {activeTab === "compose" && (
          <div className="builder-compose-panel">
            <BuildMapPanel
              buildMap={buildMap}
              onAddSection={(id) => {
                onAddSection(id);
                onTabChange("improve");
              }}
              onImproveSection={(id) => {
                onImproveSection(id);
                onTabChange("improve");
              }}
            />
            <p className="muted">Edit sections in the canvas. Use Improve for variants.</p>
          </div>
        )}

        {activeTab === "inspect" && (
          <div className="builder-inspect-panel" data-testid="builder-inspect-panel">
            <ArtifactQualityPanel quality={quality} />
            <BuildMapPanel buildMap={buildMap} onImproveSection={onImproveSection} />
            {visibleFixes.length > 0 && (
              <div className="suggested-fixes" data-testid="suggested-fixes">
                <h4>Suggested fixes</h4>
                <ul>
                  {visibleFixes.map((fix) => (
                    <li key={fix.id} data-testid={`suggested-fix-${fix.id}`}>
                      <span className={`fix-severity ${fix.severity}`}>{fix.severity}</span>
                      {fix.label}
                      <div className="fix-actions">
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => onApplyFix(fix.id, fix.targetSectionId)}
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => onIgnoreFix(fix.id)}
                        >
                          Ignore
                        </button>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => onRegenerateFix(fix.id, fix.targetSectionId)}
                        >
                          Regenerate
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <BuilderContextPanel items={contextItems} />
            {traceSummary && (
              <div className="builder-trace-summary muted" data-testid="builder-trace-summary">
                <h4>Trace</h4>
                <p>{traceSummary}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "improve" && (
          <div className="builder-improve-panel" data-testid="builder-improve-panel">
            {artifact.sections.map((section: ArtifactSection) => (
              <div key={section.id} className="improve-section-block">
                <button
                  type="button"
                  className={`improve-section-label${selectedSectionId === section.id ? " active" : ""}`}
                  onClick={() => onSelectSection(section.id)}
                >
                  {section.label}
                </button>
                {(selectedSectionId === section.id || artifact.sections.length === 1) && (
                  <SectionVariantMenu
                    sectionId={section.id}
                    onVariant={onVariant}
                    onRegenerate={onRegenerateSection}
                    onEdit={onEditSection}
                    onExpand={(id) => onVariant(id, "premium")}
                    onAlternate={(id) => onRegenerateSection(id)}
                    loading={sectionLoading}
                  />
                )}
              </div>
            ))}
            {selectedSection && (
              <VersionHistoryPanel
                sectionLabel={selectedSection.label}
                versions={versionState[selectedSection.id] ?? []}
                onRestore={onRestoreVersion}
                onCompare={onCompareVersion}
                onCopyVersion={() => notify("Version copied")}
              />
            )}
          </div>
        )}

        {activeTab === "package" && (
          <div className="builder-package-panel" data-testid="builder-package-panel">
            <h4>Package & export</h4>
            <ul className="package-actions">
              {packageActions.map((pkg) => (
                <li key={pkg.id}>
                  <button
                    type="button"
                    className="btn ghost small"
                    data-testid={`package-action-${pkg.id}`}
                    onClick={() => void runPackageAction(pkg.id)}
                  >
                    {pkg.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === "execute" && (
          <>
            <RelatedArtifactsPanel
              parentArtifact={rootArtifact}
              children={relatedChildren}
              lastTransformLabel={lastTransformLabel}
              onOpenChild={(id) => onOpenChild?.(id)}
              onOpenChildInBuilder={(id) => onOpenChildInBuilder?.(id)}
              onKeepOriginal={() => onKeepOriginal?.()}
            />
            <ExecutePanel
              artifact={rootArtifact}
              onTransform={onTransform}
              loading={transformLoading}
            />
          </>
        )}
      </div>
    </aside>
  );
}
