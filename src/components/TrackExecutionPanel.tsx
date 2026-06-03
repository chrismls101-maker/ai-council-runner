import { useEffect, useState } from "react";
import {
  OUTCOME_STATUS_LABELS,
  type DecisionOutcome,
  type OutcomeStatus,
} from "../types/decisionQuality";
import { buildClientLearningSummary, type DecisionRecord } from "../types/decisionRecord";
import { withIivoWordmark } from "../utils/brandText";

interface TrackExecutionPanelProps {
  runId: string | null;
  outcome: DecisionOutcome | undefined;
  decisionRecord?: DecisionRecord | null;
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

export default function TrackExecutionPanel({
  runId,
  outcome,
  decisionRecord,
  onSave,
  readOnly = false,
}: TrackExecutionPanelProps) {
  const [actionTaken, setActionTaken] = useState(
    decisionRecord?.actionTaken ?? outcome?.actionTaken ?? "",
  );
  const [expectedOutcome, setExpectedOutcome] = useState(
    decisionRecord?.expectedOutcome ?? outcome?.expectedOutcome ?? "",
  );
  const [status, setStatus] = useState<OutcomeStatus>(
    decisionRecord?.outcomeStatus ?? outcome?.status ?? "not_started",
  );
  const [actualOutcome, setActualOutcome] = useState(
    decisionRecord?.actualOutcome ?? outcome?.actualOutcome ?? outcome?.notes ?? "",
  );
  const [resultMetric, setResultMetric] = useState(
    decisionRecord?.resultMetric ?? outcome?.resultMetric ?? "",
  );
  const [lessonsLearned, setLessonsLearned] = useState(
    decisionRecord?.lessonsLearned ?? outcome?.lessonsLearned ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setActionTaken(decisionRecord?.actionTaken ?? outcome?.actionTaken ?? "");
    setExpectedOutcome(decisionRecord?.expectedOutcome ?? outcome?.expectedOutcome ?? "");
    setStatus(decisionRecord?.outcomeStatus ?? outcome?.status ?? "not_started");
    setActualOutcome(
      decisionRecord?.actualOutcome ?? outcome?.actualOutcome ?? outcome?.notes ?? "",
    );
    setResultMetric(decisionRecord?.resultMetric ?? outcome?.resultMetric ?? "");
    setLessonsLearned(decisionRecord?.lessonsLearned ?? outcome?.lessonsLearned ?? "");
  }, [decisionRecord, outcome]);

  const previewRecord: DecisionRecord = {
    id: decisionRecord?.id ?? "",
    runId: runId ?? "",
    timestamp: decisionRecord?.timestamp ?? new Date().toISOString(),
    workflowId: decisionRecord?.workflowId ?? "",
    route: decisionRecord?.route ?? "",
    decisionTitle: decisionRecord?.decisionTitle ?? "Decision",
    originalPrompt: decisionRecord?.originalPrompt ?? "",
    riskFlags: [],
    sourcesUsed: [],
    includedMemoryIds: [],
    outcomeStatus: status,
    actionTaken,
    expectedOutcome,
    actualOutcome,
    resultMetric,
    lessonsLearned,
    updatedAt: decisionRecord?.updatedAt ?? new Date().toISOString(),
  };

  const learningSummary = buildClientLearningSummary(previewRecord);

  const handleSave = async () => {
    if (!runId) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave({
        status,
        actionTaken: actionTaken.trim() || undefined,
        expectedOutcome: expectedOutcome.trim() || undefined,
        actualOutcome: actualOutcome.trim() || undefined,
        notes: actualOutcome.trim() || undefined,
        resultMetric: resultMetric.trim() || undefined,
        lessonsLearned: lessonsLearned.trim() || undefined,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="track-execution" data-testid="track-execution-panel">
      <p className="track-execution-desc muted">
        {withIivoWordmark(
          "Log what you did, what happened, and what to change next time. IIVO uses this to improve future decisions.",
          "track-exec-desc",
        )}
      </p>

      <label className="outcome-field">
        <span>Action taken</span>
        <textarea
          value={actionTaken}
          onChange={(e) => setActionTaken(e.target.value)}
          placeholder="Contacted 5 prospects; 2 replied; scheduled 1 demo."
          rows={2}
          disabled={readOnly || !runId}
        />
      </label>

      <label className="outcome-field">
        <span>Expected outcome</span>
        <input
          type="text"
          value={expectedOutcome}
          onChange={(e) => setExpectedOutcome(e.target.value)}
          placeholder="Get at least 2 replies."
          disabled={readOnly || !runId}
        />
      </label>

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
        <span>Actual outcome</span>
        <textarea
          value={actualOutcome}
          onChange={(e) => setActualOutcome(e.target.value)}
          placeholder="2 replies, 0 sales."
          rows={2}
          disabled={readOnly || !runId}
        />
      </label>

      <label className="outcome-field">
        <span>Metric / result</span>
        <input
          type="text"
          value={resultMetric}
          onChange={(e) => setResultMetric(e.target.value)}
          placeholder="20 contacted, 2 replies, 0 closed."
          disabled={readOnly || !runId}
        />
      </label>

      <label className="outcome-field">
        <span>Lessons learned</span>
        <textarea
          value={lessonsLearned}
          onChange={(e) => setLessonsLearned(e.target.value)}
          placeholder="Missed-call angle got replies, but offer needs clearer pricing."
          rows={3}
          disabled={readOnly || !runId}
        />
      </label>

      <div className="learning-summary-block" data-testid="learning-summary">
        <span className="learning-summary-label">Learning summary</span>
        <p className="learning-summary-text">{learningSummary}</p>
      </div>

      {!readOnly && runId && (
        <div className="outcome-actions">
          <button
            type="button"
            className="btn primary small"
            onClick={handleSave}
            disabled={saving}
            data-testid="track-execution-save"
          >
            {saving ? "Saving…" : "Save execution log"}
          </button>
          {saved && <span className="outcome-saved">Saved locally</span>}
        </div>
      )}

      {(outcome?.updatedAt || decisionRecord?.updatedAt) && (
        <p className="outcome-updated muted">
          Last updated{" "}
          {new Date(outcome?.updatedAt ?? decisionRecord!.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
