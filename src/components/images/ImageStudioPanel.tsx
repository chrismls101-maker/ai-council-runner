import { useCallback, useEffect, useMemo, useState } from "react";
import type { IivoArtifact } from "../../types/artifacts";
import type { ImageBrief, ImageStudioConfig, ImageVisualType } from "../../types/imageStudio";
import {
  attachImageToArtifact,
  createStudioImageVariant,
  estimateImageCredits,
  fetchImageBrief,
  fetchImageStudioConfig,
  generateStudioImage,
  generateStudioImagePack,
  imageIdsFromArtifact,
  imageQualityFromArtifact,
} from "../../utils/imageApi";
import { getContextualVisualActions } from "../../utils/imageStudioActions";
import ImageActions from "./ImageActions";
import ImageBriefEditor from "./ImageBriefEditor";
import ImagePackBuilder from "./ImagePackBuilder";
import ImageQualityPanel from "./ImageQualityPanel";
import ImageResultGrid from "./ImageResultGrid";

export interface ImageStudioPanelProps {
  sourceArtifact: IivoArtifact;
  userPrompt?: string;
  initialVisualType?: ImageVisualType;
  onAttachToSource?: (artifact: IivoArtifact) => void;
  onFeedback?: (message: string) => void;
}

type StudioMode = "single" | "pack";

export default function ImageStudioPanel({
  sourceArtifact,
  userPrompt,
  initialVisualType,
  onAttachToSource,
  onFeedback,
}: ImageStudioPanelProps) {
  const [config, setConfig] = useState<ImageStudioConfig | null>(null);
  const [mode, setMode] = useState<StudioMode>("single");
  const [visualType, setVisualType] = useState<ImageVisualType>(initialVisualType ?? "hero_visual");
  const [brief, setBrief] = useState<ImageBrief | null>(null);
  const [ipWarning, setIpWarning] = useState<string | undefined>();
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [resultArtifact, setResultArtifact] = useState<IivoArtifact | null>(null);
  const [packResult, setPackResult] = useState<IivoArtifact | null>(null);
  const [count, setCount] = useState(1);
  const [runVisionQa, setRunVisionQa] = useState(false);

  const actions = useMemo(
    () => getContextualVisualActions(sourceArtifact.type),
    [sourceArtifact.type],
  );

  const notify = useCallback((msg: string) => onFeedback?.(msg), [onFeedback]);

  useEffect(() => {
    void fetchImageStudioConfig().then(setConfig);
  }, []);

  useEffect(() => {
    if (initialVisualType) setVisualType(initialVisualType);
  }, [initialVisualType]);

  const loadBrief = useCallback(async () => {
    setLoadingBrief(true);
    const response = await fetchImageBrief({
      userPrompt,
      visualType,
      artifact: sourceArtifact,
    });
    setLoadingBrief(false);
    if (!response) {
      notify("Could not build image brief.");
      return;
    }
    setBrief(response.brief);
    setIpWarning(response.ipGuard.warning);
  }, [notify, sourceArtifact, userPrompt, visualType]);

  useEffect(() => {
    if (mode === "single") void loadBrief();
  }, [loadBrief, mode]);

  const creditEstimate = estimateImageCredits(
    count,
    config?.creditsPerImage ?? 3,
    config?.visionQaCredits ?? 0,
    runVisionQa,
  );

  const handleGenerate = async () => {
    if (!brief) {
      notify("Image brief is required before generating.");
      return;
    }
    setGenerating(true);
    const response = await generateStudioImage({
      userPrompt,
      visualType,
      artifact: sourceArtifact,
      count,
      briefOverride: brief,
      runVisionQa,
    });
    setGenerating(false);
    if (!response) {
      notify("Image generation failed or unavailable.");
      return;
    }
    setResultArtifact(response.artifact);
    setBrief(response.brief);
    setIpWarning(response.ipGuard.warning);
    notify("Visual generated in IIVO Image Studio.");
  };

  const handleAttach = async (imageId?: string) => {
    const id = imageId ?? imageIdsFromArtifact(resultArtifact)[0];
    if (!id) return;
    const attached = await attachImageToArtifact({
      targetArtifact: sourceArtifact,
      imageId: id,
      label: "Attached visual",
    });
    if (!attached) {
      notify("Could not attach visual to artifact.");
      return;
    }
    onAttachToSource?.(attached);
    notify("Visual attached to artifact.");
  };

  const handleAttachMany = async (imageIds: string[]) => {
    let current = sourceArtifact;
    for (const imageId of imageIds) {
      const attached = await attachImageToArtifact({
        targetArtifact: current,
        imageId,
        label: "Attached pack visual",
      });
      if (!attached) {
        notify("Could not attach one or more pack visuals.");
        return;
      }
      current = attached;
    }
    onAttachToSource?.(current);
    notify(`Attached ${imageIds.length} pack visual(s).`);
  };

  const handleVariant = async () => {
    const imageId = imageIdsFromArtifact(resultArtifact)[0];
    if (!imageId) return;
    setGenerating(true);
    const response = await createStudioImageVariant({ sourceImageId: imageId, runVisionQa });
    setGenerating(false);
    if (!response) {
      notify("Variant generation failed.");
      return;
    }
    setResultArtifact(response.artifact);
    notify("Variant created.");
  };

  const handlePackGenerate = async (input: {
    packType: import("../../types/imageStudio").ImagePackType;
    count: number;
    aspectRatio: string;
    styleConsistency: boolean;
    sharedBriefPrompt: string;
    variations: import("../../types/imageStudio").ImagePackVariation[];
    runVisionQa: boolean;
  }) => {
    setGenerating(true);
    const response = await generateStudioImagePack({
      packType: input.packType,
      count: input.count,
      aspectRatio: input.aspectRatio,
      styleConsistency: input.styleConsistency,
      userPrompt: input.sharedBriefPrompt,
      artifact: sourceArtifact,
      variations: input.variations,
      runVisionQa: input.runVisionQa,
    });
    setGenerating(false);
    if (!response) {
      notify("Image pack generation failed.");
      return;
    }
    setPackResult(response.artifact);
    notify("Image pack generated.");
  };

  const providerStatus = config?.configured
    ? `Provider configured (${config.activeProvider})`
    : config?.reason ?? "Using IIVO mock provider";

  return (
    <div className="image-studio-panel" data-testid="image-studio-panel">
      <header className="image-studio-header">
        <h3>IIVO Image Studio</h3>
        <p className="muted">Business-context visual generation for this workspace artifact.</p>
        <p className="muted" data-testid="image-provider-status">
          {providerStatus}
        </p>
      </header>

      <div className="image-studio-mode-row">
        <button
          type="button"
          className={`btn ghost small${mode === "single" ? " active" : ""}`}
          data-testid="image-studio-mode-single"
          onClick={() => setMode("single")}
        >
          Single visual
        </button>
        <button
          type="button"
          className={`btn ghost small${mode === "pack" ? " active" : ""}`}
          data-testid="image-studio-mode-pack"
          onClick={() => setMode("pack")}
        >
          Image pack
        </button>
      </div>

      {!config?.configured && (
        <div className="banner warning" data-testid="image-generation-unavailable">
          Live image provider is not configured. IIVO mock provider is available for development and QA.
        </div>
      )}

      {mode === "pack" ? (
        <ImagePackBuilder
          sharedPrompt={userPrompt ?? brief?.prompt ?? ""}
          creditsPerImage={config?.creditsPerImage ?? 3}
          visionQaCredits={config?.visionQaCredits ?? 0}
          generating={generating}
          resultArtifact={packResult}
          onGenerate={handlePackGenerate}
          onAttachSelected={(ids) => void handleAttachMany(ids)}
          onRegenerateIndex={() => notify("Regenerate one image from pack actions when ready.")}
          onFeedback={notify}
        />
      ) : (
        <>
          <div className="image-studio-actions-row">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`btn ghost small${visualType === action.visualType ? " active" : ""}`}
                data-testid={`image-action-${action.id}`}
                onClick={() => setVisualType(action.visualType)}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              className={`btn ghost small${visualType === "proposal_cover" ? " active" : ""}`}
              data-testid="image-action-proposal-cover"
              onClick={() => setVisualType("proposal_cover")}
            >
              Proposal cover
            </button>
          </div>

          {loadingBrief && <p className="muted">Building image brief…</p>}
          {brief && (
            <ImageBriefEditor brief={brief} onChange={setBrief} ipWarning={ipWarning} />
          )}

          <div className="image-studio-generate-row">
            <label className="image-count-field">
              Count
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={runVisionQa}
                onChange={(e) => setRunVisionQa(e.target.checked)}
              />
              Optional visual QA (+{config?.visionQaCredits ?? 0})
            </label>
            <span className="muted" data-testid="image-credit-estimate">
              Estimated credits: {creditEstimate}
            </span>
            <button
              type="button"
              className="btn primary"
              data-testid="image-generate-button"
              disabled={generating || !brief}
              onClick={() => void handleGenerate()}
            >
              {generating ? "Generating…" : "Generate visual"}
            </button>
          </div>

          {generating && <p data-testid="image-generating">Generating visual…</p>}

          <ImageResultGrid artifact={resultArtifact} />
          <ImageQualityPanel quality={imageQualityFromArtifact(resultArtifact)} />

          {resultArtifact && (
            <ImageActions
              artifact={resultArtifact}
              imageId={imageIdsFromArtifact(resultArtifact)[0]}
              onRegenerate={() => void handleGenerate()}
              onCreateVariants={() => void handleVariant()}
              onAttach={() => void handleAttach()}
              onFeedback={notify}
            />
          )}
        </>
      )}
    </div>
  );
}
