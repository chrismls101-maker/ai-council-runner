import type { SectionVariantType } from "../../types/builderWorkspace";

const VARIANTS: Array<{ type: SectionVariantType; label: string }> = [
  { type: "shorter", label: "Shorten" },
  { type: "premium", label: "Make more premium" },
  { type: "direct", label: "Make more direct" },
  { type: "human", label: "Make more human" },
  { type: "proof", label: "Add proof" },
  { type: "risk_reduced", label: "Reduce risk" },
  { type: "spanish", label: "Translate to Spanish" },
];

export interface SectionVariantMenuProps {
  sectionId: string;
  onVariant: (sectionId: string, variantType: SectionVariantType) => void;
  onRegenerate: (sectionId: string) => void;
  onEdit: (sectionId: string) => void;
  onExpand?: (sectionId: string) => void;
  onAlternate?: (sectionId: string) => void;
  loading?: boolean;
}

export default function SectionVariantMenu({
  sectionId,
  onVariant,
  onRegenerate,
  onEdit,
  onExpand,
  onAlternate,
  loading = false,
}: SectionVariantMenuProps) {
  return (
    <div className="section-variant-menu" data-testid={`section-variant-menu-${sectionId}`}>
      <div className="section-variant-row">
        <button
          type="button"
          className="btn ghost small"
          disabled={loading}
          data-testid={`section-edit-${sectionId}`}
          onClick={() => onEdit(sectionId)}
        >
          Edit
        </button>
        <button
          type="button"
          className="btn ghost small"
          disabled={loading}
          data-testid={`section-regenerate-${sectionId}`}
          onClick={() => onRegenerate(sectionId)}
        >
          Regenerate
        </button>
        {onExpand && (
          <button
            type="button"
            className="btn ghost small"
            disabled={loading}
            onClick={() => onExpand(sectionId)}
          >
            Expand
          </button>
        )}
        {onAlternate && (
          <button
            type="button"
            className="btn ghost small"
            disabled={loading}
            onClick={() => onAlternate(sectionId)}
          >
            Alternate version
          </button>
        )}
      </div>
      <div className="section-variant-variants" data-testid="section-variant-actions">
        {VARIANTS.map((v) => (
          <button
            key={v.type}
            type="button"
            className="btn ghost small"
            disabled={loading}
            data-testid={`section-variant-${v.type}-${sectionId}`}
            onClick={() => onVariant(sectionId, v.type)}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
