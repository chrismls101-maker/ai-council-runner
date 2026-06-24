import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTO_MODEL_DESCRIPTION,
  CODER_AGENT_MODELS,
  CODER_MODEL_PICKER_SECTIONS,
  modelPickerLabel,
  type CoderAgentModelId,
  parseCoderAgentModelId,
} from "../../shared/coderAgentModels.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { send } from "../useGlassState.ts";

interface GlassIdeModelSelectorProps {
  modelId: CoderAgentModelId;
  disabled?: boolean;
}

export function GlassIdeModelSelector({
  modelId,
  disabled = false,
}: GlassIdeModelSelectorProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const parsedId = parseCoderAgentModelId(modelId);
  const isAuto = parsedId === "auto";
  const activeLabel = modelPickerLabel(parsedId);

  const selectModel = useCallback((id: CoderAgentModelId): void => {
    send({ type: "set-glass-coder-settings", patch: { coderAgentModel: id } });
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  return (
    <div className="gide-model-select" ref={rootRef} data-testid="glass-ide-model-select">
      <GlassHoverTooltip label="Automatically pick the best model for each task" placement="top">
        <button
          type="button"
          className={`gide-model-select__auto-pill${isAuto ? " gide-model-select__auto-pill--active" : ""}`}
          disabled={disabled}
          aria-pressed={isAuto}
          onClick={() => selectModel("auto")}
          onPointerDown={ensureOverlayInteractive}
        >
          Auto
        </button>
      </GlassHoverTooltip>
      <button
        type="button"
        className="gide-model-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onPointerDown={ensureOverlayInteractive}
      >
        <span className="gide-model-select__label">{isAuto ? "Model" : activeLabel}</span>
        <span className="gide-model-select__chevron" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="gide-model-select__menu" role="listbox" aria-label="Coder model">
          {CODER_MODEL_PICKER_SECTIONS.map((section) => (
            <div key={section.id} className="gide-model-select__section">
              {section.label ? (
                <p className="gide-model-select__section-label">{section.label}</p>
              ) : null}
              <ul className="gide-model-select__list">
                {section.models.map((id) => {
                  const selected = id === parsedId;
                  if (id === "auto") {
                    return (
                      <li key={id} role="option" aria-selected={selected}>
                        <button
                          type="button"
                          className={`gide-model-select__option${selected ? " gide-model-select__option--active" : ""}`}
                          onClick={() => selectModel(id)}
                          onPointerDown={ensureOverlayInteractive}
                        >
                          <span className="gide-model-select__option-row">
                            <span className="gide-model-select__option-label">Auto</span>
                            <span className="gide-model-select__option-chips">Picks best for task</span>
                          </span>
                          <span className="gide-model-select__option-desc">{AUTO_MODEL_DESCRIPTION}</span>
                        </button>
                      </li>
                    );
                  }
                  const def = CODER_AGENT_MODELS[id];
                  return (
                    <li key={id} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        className={`gide-model-select__option${selected ? " gide-model-select__option--active" : ""}`}
                        onClick={() => selectModel(id)}
                        onPointerDown={ensureOverlayInteractive}
                      >
                        <span className="gide-model-select__option-row">
                          <span className="gide-model-select__option-label">{def.label}</span>
                          <span className="gide-model-select__option-chips">{def.chips}</span>
                        </span>
                        <span className="gide-model-select__option-desc">{def.description}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
