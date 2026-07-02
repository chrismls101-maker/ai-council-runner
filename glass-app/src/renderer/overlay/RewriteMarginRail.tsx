import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RewriteFinding,
  RewriteFindingsState,
} from "../../shared/glassRewriteTypes.ts";
import type { TypingIntelligenceState } from "../../shared/glassTypingIntelligenceTypes.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import { GlassSurface } from "../shared/GlassSurface.tsx";
import "./RewriteMarginRail.css";

/**
 * Glass Rewrite — margin rail + annotation cards.
 *
 * Glass Rewrite has no persistent visible presence: the rail exists only when
 * the delta engine found something. Beads appear during pauses with a quiet
 * fade; hovering one expands the annotation card whose centerpiece is the
 * other person's exact words.
 */

const BEAD_GLYPH: Record<RewriteFinding["category"], string> = {
  missing: "○",
  contradicts: "◆",
  tone: "~",
};

function AnnotationCard({
  finding,
  onApply,
}: {
  finding: RewriteFinding;
  onApply: (finding: RewriteFinding) => void;
}): JSX.Element {
  const heading =
    finding.category === "missing"
      ? "They asked about this:"
      : finding.category === "contradicts"
        ? "Conflict:"
        : "Tone:";

  return (
    <GlassSurface
      className="rewrite-annotation glass-surface--arriving"
      origin="left center"
      radius={12}
      data-testid="glass-rewrite-annotation"
    >
      <div className={`rewrite-annotation__heading rewrite-annotation__heading--${finding.category}`}>
        <span className="rewrite-annotation__glyph">{BEAD_GLYPH[finding.category]}</span>
        {heading}
      </div>

      {/* Their exact words — the proof Glass read the other document. */}
      <blockquote className="rewrite-annotation__quote">“{finding.sourceQuote}”</blockquote>

      {finding.category === "missing" ? (
        <p className="rewrite-annotation__note">Your draft doesn&apos;t address it.</p>
      ) : null}
      {finding.category === "contradicts" ? (
        <p className="rewrite-annotation__note">{finding.description}</p>
      ) : null}
      {finding.category === "tone" ? (
        <p className="rewrite-annotation__note">{finding.description}</p>
      ) : null}

      {finding.suggestion ? (
        <button
          type="button"
          className={`rewrite-annotation__chip${
            finding.category === "contradicts" ? " rewrite-annotation__chip--filled" : ""
          }`}
          onPointerDown={ensureOverlayInteractive}
          onClick={() => onApply(finding)}
        >
          {finding.category === "contradicts"
            ? `Fix to ${finding.suggestion.length > 24 ? `${finding.suggestion.slice(0, 24)}…` : finding.suggestion} ↗`
            : finding.category === "missing"
              ? "Insert draft ↗"
              : "Apply ↗"}
        </button>
      ) : null}
    </GlassSurface>
  );
}

/** The whole-field rewrite suggestion (short drafts only) — quiet annotation card, no branding. */
function RewriteSuggestionCard({
  runtime,
  enterInteractive,
  leaveInteractive,
}: {
  runtime: TypingIntelligenceState;
  enterInteractive?: () => void;
  leaveInteractive?: () => void;
}): JSX.Element | null {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const bounds = runtime.currentFieldBounds;
  if (!bounds || !runtime.rewrite) return null;

  const placeAbove = bounds.y + bounds.height / 2 >= window.innerHeight / 2;
  const style = placeAbove
    ? { left: bounds.x, bottom: window.innerHeight - bounds.y + 10, width: Math.min(Math.max(bounds.width, 300), 460) }
    : { left: bounds.x, top: bounds.y + bounds.height + 10, width: Math.min(Math.max(bounds.width, 300), 460) };

  // Tab/Esc live on the card element — never as global shortcuts (Fix 1).
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Tab") {
      e.preventDefault();
      window.glass.acceptTypingIntelligence();
    } else if (e.key === "Escape") {
      e.preventDefault();
      window.glass.dismissTypingIntelligence();
    }
  };

  return (
    <GlassSurface
      ref={cardRef}
      className="rewrite-suggestion glass-surface--arriving"
      origin={placeAbove ? "left bottom" : "left top"}
      style={style}
      data-testid="glass-typing-intelligence-overlay"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerEnter={() => {
        ensureOverlayInteractive();
        enterInteractive?.();
        cardRef.current?.focus();
      }}
      onPointerLeave={leaveInteractive}
    >
      <p className="rewrite-suggestion__text">{runtime.rewrite}</p>
      <div className="rewrite-suggestion__actions">
        <button
          type="button"
          className="rewrite-annotation__chip rewrite-annotation__chip--filled"
          onPointerDown={ensureOverlayInteractive}
          onClick={() => window.glass.acceptTypingIntelligence()}
        >
          Accept ⇥
        </button>
        <button
          type="button"
          className="rewrite-annotation__chip"
          onPointerDown={ensureOverlayInteractive}
          onClick={() => window.glass.dismissTypingIntelligence()}
        >
          Dismiss esc
        </button>
      </div>
    </GlassSurface>
  );
}

export function RewriteMarginRail({
  enabled,
  enterInteractive,
  leaveInteractive,
}: {
  enabled: boolean;
  enterInteractive?: () => void;
  leaveInteractive?: () => void;
}): JSX.Element | null {
  const [findingsState, setFindingsState] = useState<RewriteFindingsState | null>(null);
  const [runtime, setRuntime] = useState<TypingIntelligenceState | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flareId, setFlareId] = useState<string | null>(null);
  const lastFlareNonceRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setFindingsState(null);
      setRuntime(null);
      return;
    }
    const unsubFindings = window.glass.onRewriteFindingsUpdate((next) => {
      setFindingsState(next);
      // Send-moment gate — one amber flare on the unresolved contradiction. Never blocks.
      if (
        next.sendFlareNonce
        && next.sendFlareNonce !== lastFlareNonceRef.current
        && next.sendFlareFindingId
      ) {
        lastFlareNonceRef.current = next.sendFlareNonce;
        setFlareId(next.sendFlareFindingId);
        setTimeout(() => setFlareId(null), 350);
      }
    });
    const unsubRuntime = window.glass.onTypingIntelligenceUpdate((next) => {
      setRuntime(next);
    });
    return () => {
      unsubFindings();
      unsubRuntime();
    };
  }, [enabled]);

  const applyFinding = useCallback((finding: RewriteFinding): void => {
    window.glass.applyRewriteFinding({ findingId: finding.id });
    setExpandedId(null);
  }, []);

  if (!enabled) return null;

  const showSuggestion = runtime?.status === "showing" && runtime.rewrite && runtime.currentFieldBounds;
  const fieldBounds = findingsState?.fieldBounds ?? null;
  const findings = findingsState?.findings ?? [];
  const showRail = fieldBounds != null && findings.length > 0;

  if (!showRail && !showSuggestion) return null;

  const expanded = findings.find((f) => f.id === expandedId) ?? null;

  return (
    <>
      {showRail && fieldBounds ? (
        <div
          className="rewrite-rail"
          style={{
            left: fieldBounds.x + fieldBounds.width + 8,
            top: fieldBounds.y,
            height: Math.max(24, fieldBounds.height),
          }}
          data-testid="glass-rewrite-rail"
          onPointerEnter={() => {
            ensureOverlayInteractive();
            enterInteractive?.();
          }}
          onPointerLeave={() => {
            setExpandedId(null);
            leaveInteractive?.();
          }}
        >
          {findings.map((finding) => (
            <button
              key={finding.id}
              type="button"
              className={`rewrite-rail__bead rewrite-rail__bead--${finding.category}${
                flareId === finding.id ? " rewrite-rail__bead--flare" : ""
              }`}
              style={{ top: `${Math.round(finding.paragraphFraction * 100)}%` }}
              aria-label={finding.description}
              onPointerEnter={() => setExpandedId(finding.id)}
              onFocus={() => setExpandedId(finding.id)}
            >
              {BEAD_GLYPH[finding.category]}
            </button>
          ))}
          {expanded && fieldBounds ? (
            <div
              className="rewrite-rail__card-anchor"
              style={{ top: `${Math.round(expanded.paragraphFraction * 100)}%` }}
            >
              <AnnotationCard finding={expanded} onApply={applyFinding} />
            </div>
          ) : null}
        </div>
      ) : null}

      {showSuggestion && runtime ? (
        <RewriteSuggestionCard
          runtime={runtime}
          enterInteractive={enterInteractive}
          leaveInteractive={leaveInteractive}
        />
      ) : null}
    </>
  );
}
