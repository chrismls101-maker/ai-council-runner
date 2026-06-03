import { useState } from "react";
import { withIivoWordmark } from "../utils/brandText";
import {
  OUTCOME_STATUS_LABELS,
  type DecisionOutcome,
  type OutcomeStatus,
} from "../types/decisionQuality";

interface OutcomeTrackingPanelProps {
  runId: string | null;
  outcome: DecisionOutcome | undefined;
  onSave: (outcome: DecisionOutcome) => Promise<void>;
  readOnly?: boolean;
}

const STATUS_OPTIONS: OutcomeStatus[] = [
  "not_started",
  "in_progress",
  "worked",
  "did_not_work",
  "needs_revision",
];

export default function OutcomeTrackingPanel({
  runId,
  outcome,
  onSave,
  readOnly = false,
}: OutcomeTrackingPanelProps) {
  const [status, setStatus] = useState<OutcomeStatus>(
    outcome?.status ?? "not_started",
  );
  const [notes, setNotes] = useState(outcome?.notes ?? "");
  const [resultMetric, setResultMetric] = useState(outcome?.resultMetric ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!runId) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave({
        status,
        notes: notes.trim() || undefined,
        resultMetric: resultMetric.trim() || undefined,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="outcome-tracking">
      <p className="outcome-tracking-desc muted">
        {withIivoWordmark(
          "Track whether this decision worked. Helps IIVO improve future recommendations.",
          "outcome-desc",
        )}
      </p>
      <label className="outcome-field">
        <span>Outcome status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as OutcomeStatus)}
          disabled={readOnly || !runId}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {OUTCOME_STATUS_LABELS[opt]}
            </option>
          ))}
        </select>
      </label>
      <label className="outcome-field">
        <span>Result notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What happened? Did the recommendation help? Any revenue, replies, or meetings?"
          rows={3}
          disabled={readOnly || !runId}
        />
      </label>
      <label className="outcome-field">
        <span>Metric / result</span>
        <input
          type="text"
          value={resultMetric}
          onChange={(e) => setResultMetric(e.target.value)}
          placeholder="e.g. 2 replies, 1 pilot signed, $500 MRR"
          disabled={readOnly || !runId}
        />
      </label>
      {!readOnly && runId && (
        <div className="outcome-actions">
          <button
            type="button"
            className="btn primary small"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save outcome"}
          </button>
          {saved && <span className="outcome-saved">Saved locally</span>}
        </div>
      )}
      {outcome?.updatedAt && (
        <p className="outcome-updated muted">
          Last updated {new Date(outcome.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
