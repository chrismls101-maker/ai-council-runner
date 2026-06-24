/**
 * MeetingIntelPanel — live Meeting Intelligence feed.
 *
 * Shown inside the Copilot panel when activeMode === "meetings" and a session
 * is live. Displays:
 *   1. Detected type badge with a "Change" inline selector
 *   2. Tracking status line (what IIVO is listening for)
 *   3. Live moment feed, grouped by type, newest first
 *
 * No AI calls in this component — purely displays state from MeetingIntelligenceState
 * which is computed by the main-process engine and broadcast via IPC.
 */

import { useState, useRef } from "react";
import { send } from "../useGlassState.ts";
import {
  MEETING_MOMENT_ICONS,
  MEETING_MOMENT_TYPE_LABELS,
  MEETING_REPORT_SECTION_ORDER,
  MEETING_SUB_TYPE_SHORT_LABELS,
  MEETING_SUB_TYPE_ORDER,
  type MeetingIntelligenceState,
  type MeetingMomentType,
  type MeetingSubType,
} from "../../shared/meetingIntelligenceTypes.ts";
import { getMeetingSchema } from "../../shared/meetingExtractionSchemas.ts";

// ─── Props ────────────────────────────────────────────────────────────────────

interface MeetingIntelPanelProps {
  intel: MeetingIntelligenceState;
}

// ─── Labels for the Change-type selector ─────────────────────────────────────

const SUB_TYPE_SELECTOR_LABELS: Record<MeetingSubType, string> = {
  sales_external: "Sales Call",
  team_internal:  "Team Meeting",
  product_review: "Product Review",
  client_account: "Client Call",
  general:        "General Meeting",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MeetingIntelPanel({ intel }: MeetingIntelPanelProps): JSX.Element {
  const [changingType, setChangingType] = useState(false);
  const [addingMoment, setAddingMoment] = useState(false);
  const [addContent, setAddContent] = useState("");
  const [addType, setAddType] = useState<MeetingMomentType>("action_item");
  const addInputRef = useRef<HTMLInputElement>(null);

  const { classification, moments } = intel;

  function handleTypeChange(subType: MeetingSubType): void {
    send({ type: "meeting-set-type", subType });
    setChangingType(false);
  }

  function handleDeleteMoment(id: string): void {
    send({ type: "meeting-delete-moment", id });
  }

  function handleAddMoment(): void {
    const content = addContent.trim();
    if (!content) return;
    send({ type: "meeting-add-moment", momentType: addType, content });
    setAddContent("");
    setAddingMoment(false);
  }

  function handleAddKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") handleAddMoment();
    if (e.key === "Escape") { setAddingMoment(false); setAddContent(""); }
  }

  // ── No classification yet ──────────────────────────────────────────────────

  if (!classification) {
    return (
      <div className="meeting-intel-panel" data-testid="meeting-intel-panel">
        <div className="meeting-intel-panel__warming-up" data-testid="meeting-intel-warming-up">
          <span className="meeting-intel-panel__warming-dot" aria-hidden="true">◉</span>
          <span>Listening… building context</span>
          <span className="meeting-intel-panel__warming-hint">
            IIVO will detect the meeting type after ~30s
          </span>
        </div>
      </div>
    );
  }

  // ── Classification in place ────────────────────────────────────────────────

  const schema = getMeetingSchema(classification.subType);
  const sectionOrder = MEETING_REPORT_SECTION_ORDER[classification.subType];

  // Group moments by type, respecting section order
  const momentsByType = new Map<MeetingMomentType, typeof moments>();
  for (const type of sectionOrder) {
    const typed = moments.filter((m) => m.type === type);
    if (typed.length > 0) {
      momentsByType.set(type, typed.slice().reverse()); // newest first
    }
  }

  const hasMoments = momentsByType.size > 0;

  return (
    <div className="meeting-intel-panel" data-testid="meeting-intel-panel">

      {/* Detection badge */}
      <div className="meeting-intel-panel__header" data-testid="meeting-intel-header">
        <span className="meeting-intel-panel__detected-label">Detected</span>

        {changingType ? (
          <div className="meeting-intel-panel__type-picker" data-testid="meeting-intel-type-picker">
            {MEETING_SUB_TYPE_ORDER.map((subType) => (
              <button
                key={subType}
                type="button"
                className={`meeting-intel-panel__type-option${classification.subType === subType ? " meeting-intel-panel__type-option--active" : ""}`}
                data-testid={`meeting-intel-type-${subType}`}
                onClick={() => handleTypeChange(subType)}
              >
                {SUB_TYPE_SELECTOR_LABELS[subType]}
              </button>
            ))}
            <button
              type="button"
              className="meeting-intel-panel__type-cancel"
              onClick={() => setChangingType(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="meeting-intel-panel__type-row">
            <span
              className="meeting-intel-panel__type-badge"
              data-testid="meeting-intel-type-badge"
            >
              {classification.manualOverride ? "📌 " : ""}
              {MEETING_SUB_TYPE_SHORT_LABELS[classification.subType]}
            </span>
            <button
              type="button"
              className="meeting-intel-panel__change-btn"
              data-testid="meeting-intel-change-btn"
              onClick={() => setChangingType(true)}
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Tracking status */}
      {!hasMoments ? (
        <p className="meeting-intel-panel__tracking" data-testid="meeting-intel-tracking">
          <span className="meeting-intel-panel__tracking-dot" aria-hidden="true">●</span>
          Tracking: {schema.trackingLabel}
        </p>
      ) : null}

      {/* Live moment feed */}
      {hasMoments ? (
        <div className="meeting-intel-panel__feed" data-testid="meeting-intel-feed">
          {Array.from(momentsByType.entries()).map(([type, typedMoments]) => {
            const sectionLabel =
              schema.reportSectionLabels[type] ??
              MEETING_MOMENT_TYPE_LABELS[type];
            const icon = MEETING_MOMENT_ICONS[type];

            return (
              <div
                key={type}
                className="meeting-intel-panel__section"
                data-testid={`meeting-intel-section-${type}`}
              >
                <div className="meeting-intel-panel__section-header">
                  <span className="meeting-intel-panel__section-icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="meeting-intel-panel__section-label">{sectionLabel}</span>
                  <span className="meeting-intel-panel__section-count">
                    {typedMoments.length}
                  </span>
                </div>
                <ul className="meeting-intel-panel__moments">
                  {typedMoments.map((moment) => (
                    <li
                      key={moment.id}
                      className={`meeting-intel-panel__moment${moment.manualOverride ? " meeting-intel-panel__moment--manual" : ""}`}
                      data-testid={`meeting-intel-moment-${moment.id}`}
                    >
                      <span className="meeting-intel-panel__moment-body">
                        <span className="meeting-intel-panel__moment-content">
                          {moment.content}
                        </span>
                        {moment.owner ? (
                          <span className="meeting-intel-panel__moment-owner">
                            → {moment.owner}
                          </span>
                        ) : null}
                        {moment.deadline ? (
                          <span className="meeting-intel-panel__moment-deadline">
                            by {moment.deadline}
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="meeting-intel-panel__moment-delete"
                        aria-label="Remove moment"
                        title="Remove"
                        onClick={() => handleDeleteMoment(moment.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Empty state — classified but no moments yet */}
      {!hasMoments ? (
        <p className="meeting-intel-panel__empty" data-testid="meeting-intel-empty">
          Moments will appear as the meeting progresses.
        </p>
      ) : null}

      {/* Add moment form */}
      {addingMoment ? (
        <div className="meeting-intel-panel__add-form" data-testid="meeting-intel-add-form">
          <select
            className="meeting-intel-panel__add-type"
            value={addType}
            onChange={(e) => setAddType(e.target.value as MeetingMomentType)}
            aria-label="Moment type"
          >
            {sectionOrder.map((t) => (
              <option key={t} value={t}>
                {MEETING_MOMENT_ICONS[t]} {schema.reportSectionLabels[t] ?? MEETING_MOMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            ref={addInputRef}
            type="text"
            className="meeting-intel-panel__add-input"
            placeholder="Describe the moment…"
            value={addContent}
            onChange={(e) => setAddContent(e.target.value)}
            onKeyDown={handleAddKeyDown}
            maxLength={300}
            autoFocus
            data-testid="meeting-intel-add-input"
          />
          <div className="meeting-intel-panel__add-actions">
            <button
              type="button"
              className="meeting-intel-panel__add-submit"
              onClick={handleAddMoment}
              disabled={!addContent.trim()}
              data-testid="meeting-intel-add-submit"
            >
              Add
            </button>
            <button
              type="button"
              className="meeting-intel-panel__add-cancel"
              onClick={() => { setAddingMoment(false); setAddContent(""); }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="meeting-intel-panel__add-trigger"
          onClick={() => { setAddingMoment(true); }}
          data-testid="meeting-intel-add-trigger"
        >
          + Add moment
        </button>
      )}

    </div>
  );
}
