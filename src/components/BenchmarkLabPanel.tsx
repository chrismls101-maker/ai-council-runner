import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import IivoWordmark from "./IivoWordmark";
import MarkdownContent from "./MarkdownContent";
import { withIivoWordmark } from "../utils/brandText";
import {
  BENCHMARK_MODE_LABELS,
  BENCHMARK_WINNER_LABELS,
  SCORE_CATEGORY_LABELS,
  VALUE_VERDICT_LABELS,
  type BenchmarkCreditEstimate,
  type BenchmarkMode,
  type BenchmarkRunRecord,
  type BenchmarkRunSummary,
  type BenchmarkScoreCategory,
  type BenchmarkScoringMeta,
} from "../types/benchmark";
import { BENCHMARK_LOW_CONFIDENCE_MESSAGE } from "../constants/publicMessages";
import {
  BENCHMARK_PROMPT_CATEGORIES,
  BENCHMARK_PROMPTS,
  RECOMMENDED_BENCHMARK_SET_COUNT,
  filterBenchmarkPrompts,
  getRecommendedStarterPrompt,
  type BenchmarkPromptCategory,
  type BenchmarkPromptDefinition,
  type BenchmarkPromptDifficulty,
} from "../constants/benchmarkPrompts";
import { formatRelativeTime } from "../utils/decisionHistory";

interface BenchmarkLabPanelProps {
  onFeedback: (message: string) => void;
}

function formatUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(4)}`;
}

function ScoreBreakdown({
  label,
  scores,
}: {
  label: ReactNode;
  scores: BenchmarkScoreCategory;
}) {
  return (
    <div className="benchmark-score-breakdown">
      <h4>{label}</h4>
      <ul>
        {(Object.keys(SCORE_CATEGORY_LABELS) as (keyof BenchmarkScoreCategory)[]).map((key) => (
          <li key={key}>
            <span>{SCORE_CATEGORY_LABELS[key]}</span>
            <strong>{scores[key]}/10</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubjectAlignmentSideView({
  label,
  side,
  testId,
}: {
  label: ReactNode;
  side: BenchmarkScoringMeta["subjectAlignment"]["baseline"];
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <p>
        {label}: {side.subjectAlignmentScore}/10
        {side.wrongSubject && (
          <span className="benchmark-warning-inline"> — Wrong-subject warning</span>
        )}
        {side.possibleInventedExpansion && (
          <span
            className="benchmark-warning-inline"
            data-testid={testId ? `${testId}-invented-expansion` : undefined}
          >
            {" "}
            — Possible invented acronym expansion
          </span>
        )}
      </p>
      {side.explanation && <p className="muted">{side.explanation}</p>}
      {side.requiredContextMin > 0 && (
        <p className="muted benchmark-context-terms">
          Product-context terms matched ({side.matchedContextTerms.length}/{side.requiredContextMin}
          {side.requiredContextMin > 1 ? "+" : ""} required):{" "}
          {side.matchedContextTerms.length > 0 ? side.matchedContextTerms.join(", ") : "none"}
        </p>
      )}
      {side.insufficientProductContext && !side.wrongSubject && (
        <p className="muted">
          {withIivoWordmark(
            "Answer uses IIVO but does not show enough product-specific context.",
            "bench-muted",
          )}
        </p>
      )}
    </div>
  );
}

function ScoringMetaSection({ meta }: { meta: BenchmarkScoringMeta }) {
  return (
    <section className="panel-section benchmark-scoring-meta" data-testid="benchmark-scoring-meta">
      <h2>Heuristic scoring analysis</h2>
      <p className="muted" data-testid="benchmark-heuristic-disclaimer">
        {BENCHMARK_LOW_CONFIDENCE_MESSAGE} Heuristic score estimates use text-matching rules.
      </p>

      <div className="benchmark-value-verdict" data-testid="benchmark-value-verdict">
        <span className="muted">Value verdict</span>
        <strong className={`value-verdict-${meta.valueVerdict}`}>
          {VALUE_VERDICT_LABELS[meta.valueVerdict]}
        </strong>
        <p className="muted">{meta.valueVerdictExplanation}</p>
      </div>

      <div className="benchmark-scoring-meta-grid">
        <div data-testid="benchmark-subject-alignment">
          <h3>Subject alignment</h3>
          <SubjectAlignmentSideView
            label="Single Model"
            side={meta.subjectAlignment.baseline}
            testId="benchmark-subject-baseline"
          />
          <SubjectAlignmentSideView
            label={<IivoWordmark />}
            side={meta.subjectAlignment.iivo}
            testId="benchmark-subject-iivo"
          />
        </div>
        <div>
          <h3>Cost-adjusted winners</h3>
          <p data-testid="benchmark-quality-winner">
            Quality winner (heuristic): {BENCHMARK_WINNER_LABELS[meta.qualityWinner]}
          </p>
          <p>Cost winner: {BENCHMARK_WINNER_LABELS[meta.costWinner]}</p>
          {meta.winnerOverrideReason && (
            <p className="benchmark-override-reason muted" data-testid="benchmark-winner-override">
              Winner override: {meta.winnerOverrideReason} (heuristic — not scientific proof)
            </p>
          )}
        </div>
      </div>

      {meta.recommendationConflict?.conflictDetected && (
        <div className="benchmark-conflict-warning" data-testid="benchmark-recommendation-conflict">
          <strong>Recommendation conflict detected</strong>
          <p className="muted">
            Baseline: {meta.recommendationConflict.baselineRecommendation ?? meta.recommendationConflict.baselineStance}
            {" · "}
            <IivoWordmark />:{" "}
            {meta.recommendationConflict.iivoRecommendation ?? meta.recommendationConflict.iivoStance}
          </p>
          {meta.recommendationConflict.explanation && (
            <p className="muted">{meta.recommendationConflict.explanation}</p>
          )}
        </div>
      )}

      {meta.warnings.length > 0 && (
        <div className="benchmark-warnings" data-testid="benchmark-warnings">
          <h3>Warnings</h3>
          <ul>
            {meta.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CriteriaChecklist({
  record,
}: {
  record: BenchmarkRunRecord;
}) {
  if (!record.criteriaEvaluation || !record.successCriteria?.length) return null;

  const { criteriaEvaluation } = record;

  return (
    <section className="panel-section benchmark-criteria-section" data-testid="benchmark-criteria-section">
      <h2>Success criteria checklist (heuristic benchmark)</h2>
      <p className="muted">
        Estimated score from text-matching heuristics — not scientific proof. Criteria matched are
        approximate.
      </p>
      <div className="benchmark-criteria-winner" data-testid="benchmark-criteria-winner">
        Criteria winner:{" "}
        <strong>{BENCHMARK_WINNER_LABELS[criteriaEvaluation.criteriaWinner]}</strong> (
        {criteriaEvaluation.baselineMatchedCount} vs {criteriaEvaluation.iivoMatchedCount} matched)
      </div>
      <div className="benchmark-criteria-grid">
        <div>
          <h3>Single Model — criteria matched</h3>
          <ul className="benchmark-criteria-list">
            {criteriaEvaluation.baseline.map((item) => (
              <li key={item.criterion} className={item.matched ? "matched" : "missing"}>
                {item.matched ? "✓" : "○"} {item.criterion}
              </li>
            ))}
          </ul>
          {criteriaEvaluation.missingBaseline.length > 0 && (
            <p className="muted benchmark-missing">
              Missing: {criteriaEvaluation.missingBaseline.join("; ")}
            </p>
          )}
        </div>
        <div>
          <h3>
            <IivoWordmark /> — criteria matched
          </h3>
          <ul className="benchmark-criteria-list">
            {criteriaEvaluation.iivo.map((item) => (
              <li key={item.criterion} className={item.matched ? "matched" : "missing"}>
                {item.matched ? "✓" : "○"} {item.criterion}
              </li>
            ))}
          </ul>
          {criteriaEvaluation.missingIivo.length > 0 && (
            <p className="muted benchmark-missing">
              Missing: {criteriaEvaluation.missingIivo.join("; ")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function BenchmarkLabPanel({ onFeedback }: BenchmarkLabPanelProps) {
  const [runs, setRuns] = useState<BenchmarkRunSummary[]>([]);
  const [selected, setSelected] = useState<BenchmarkRunRecord | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedLibraryPrompt, setSelectedLibraryPrompt] = useState<BenchmarkPromptDefinition | null>(
    null,
  );
  const [categoryFilter, setCategoryFilter] = useState<BenchmarkPromptCategory | "all">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<BenchmarkPromptDifficulty | "all">("all");
  const [mode, setMode] = useState<BenchmarkMode>("single_model_vs_iivo");
  const [workflowId, setWorkflowId] = useState("auto");
  const [estimate, setEstimate] = useState<BenchmarkCreditEstimate | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showRecommendedConfirm, setShowRecommendedConfirm] = useState(false);

  const filteredPrompts = useMemo(
    () => filterBenchmarkPrompts({ category: categoryFilter, difficulty: difficultyFilter }),
    [categoryFilter, difficultyFilter],
  );

  const refresh = useCallback(async () => {
    const res = await fetch("/api/benchmarks");
    const data = (await res.json()) as { runs: BenchmarkRunSummary[] };
    setRuns(data.runs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyLibraryPrompt = useCallback((libraryPrompt: BenchmarkPromptDefinition) => {
    setSelectedLibraryId(libraryPrompt.id);
    setSelectedLibraryPrompt(libraryPrompt);
    setPrompt(libraryPrompt.prompt);
    if (libraryPrompt.suggestedWorkflowId && libraryPrompt.suggestedWorkflowId !== "auto") {
      setWorkflowId(libraryPrompt.suggestedWorkflowId);
    }
  }, []);

  useEffect(() => {
    if (!prompt.trim()) {
      setEstimate(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch("/api/benchmarks/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, workflowId, benchmarkMode: mode }),
      })
        .then((r) => r.json())
        .then((data: BenchmarkCreditEstimate) => setEstimate(data))
        .catch(() => setEstimate(null));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [prompt, workflowId, mode]);

  const openRun = async (id: string) => {
    const res = await fetch(`/api/benchmarks/${id}`);
    if (!res.ok) return;
    setSelected((await res.json()) as BenchmarkRunRecord);
  };

  const runBenchmark = async () => {
    if (!prompt.trim() || running) return;
    setRunning(true);
    try {
      const res = await fetch("/api/benchmarks/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          promptLibraryId: selectedLibraryId ?? undefined,
          benchmarkMode: mode,
          workflowId,
          tokenMode: "small",
        }),
      });
      if (res.status === 402) {
        const err = (await res.json()) as { error?: string };
        onFeedback(err.error ?? "Not enough credits for benchmark");
        return;
      }
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        onFeedback(err.error ?? "Benchmark failed");
        return;
      }
      const record = (await res.json()) as BenchmarkRunRecord;
      setSelected(record);
      setPrompt("");
      setSelectedLibraryId(null);
      setSelectedLibraryPrompt(null);
      await refresh();
      onFeedback("Benchmark complete");
    } catch {
      onFeedback("Benchmark failed");
    } finally {
      setRunning(false);
    }
  };

  const deleteRun = async (id: string) => {
    if (!window.confirm("Delete this benchmark run?")) return;
    await fetch(`/api/benchmarks/${id}`, { method: "DELETE" });
    if (selected?.id === id) setSelected(null);
    await refresh();
    onFeedback("Benchmark deleted");
  };

  const saveToMemory = async (id: string) => {
    const res = await fetch(`/api/benchmarks/${id}/save-memory`, { method: "POST" });
    if (!res.ok) {
      onFeedback("Could not save to memory");
      return;
    }
    onFeedback("Saved benchmark to Memory Vault");
  };

  const handleRecommendedSet = () => {
    const starter = getRecommendedStarterPrompt();
    const credits = estimate?.totalCredits ?? "several";
    setShowRecommendedConfirm(true);
    onFeedback(
      `Recommended set: ${RECOMMENDED_BENCHMARK_SET_COUNT} benchmark selected ("${starter.title}"). This may use ~${credits} credits when you run it.`,
    );
    applyLibraryPrompt(starter);
  };

  const isHardLibraryPrompt = selectedLibraryPrompt?.difficulty === "hard";

  if (selected) {
    return (
      <div className="benchmark-lab-panel" data-testid="benchmark-lab-detail">
        <header className="panel-page-header">
          <button type="button" className="btn ghost small" onClick={() => setSelected(null)}>
            ← Back to Benchmark Lab
          </button>
          <h1>Benchmark comparison</h1>
          {selected.promptTitle && (
            <p className="panel-page-subtitle">
              <strong>{selected.promptTitle}</strong>
            </p>
          )}
          <p className="panel-page-subtitle muted">{selected.prompt}</p>
          {selected.expectedBestRoute && (
            <p className="muted">Expected best route: {selected.expectedBestRoute}</p>
          )}
        </header>

        <section className="benchmark-result-hero">
          <div
            className={`benchmark-winner-badge winner-${selected.winner}`}
            data-testid="benchmark-winner"
          >
            {BENCHMARK_WINNER_LABELS[selected.winner]} (estimated score)
          </div>
          <div className="benchmark-result-stats">
            <div>
              <span className="muted">Score diff</span>
              <strong data-testid="benchmark-score-diff">
                {selected.scoreDifference > 0 ? "+" : ""}
                {selected.scoreDifference} ({selected.scoreDifferencePercent}%)
              </strong>
            </div>
            <div>
              <span className="muted">Cost diff</span>
              <strong>{formatUsd(selected.costDifferenceUsd)}</strong>
            </div>
            <div>
              <span className="muted">Credits used</span>
              <strong data-testid="benchmark-total-credits">{selected.totalCredits}</strong>
            </div>
          </div>
          <p className="benchmark-summary">{selected.summary}</p>
          {selected.routerNote && (
            <p className="benchmark-router-note muted">{selected.routerNote}</p>
          )}
        </section>

        {selected.scoringMeta && <ScoringMetaSection meta={selected.scoringMeta} />}

        <CriteriaChecklist record={selected} />

        <div className="benchmark-compare-grid" data-testid="benchmark-compare-grid">
          <article className="benchmark-compare-col">
            <h2>Single Model</h2>
            <p className="muted">
              {selected.baselineModel} · {selected.baselineCredits} credits ·{" "}
              {formatUsd(selected.baselineCost?.estimatedCostUsd)}
            </p>
            <div className="benchmark-answer" data-testid="benchmark-baseline-answer">
              <MarkdownContent content={selected.baselineAnswer} />
            </div>
            <ScoreBreakdown label="Baseline scores (heuristic)" scores={selected.scores.baseline} />
          </article>
          <article className="benchmark-compare-col">
            <h2>
              <IivoWordmark />
            </h2>
            <p className="muted">
              {selected.iivoWorkflowId} · {selected.iivoCredits} credits ·{" "}
              {formatUsd(selected.iivoCost?.estimatedCostUsd)}
            </p>
            <div className="benchmark-answer" data-testid="benchmark-iivo-answer">
              <MarkdownContent content={selected.iivoAnswer} />
            </div>
            <ScoreBreakdown
              label={withIivoWordmark("IIVO scores (heuristic)", "bench-iivo-scores")}
              scores={selected.scores.iivo}
            />
          </article>
        </div>

        <section className="panel-section">
          <h2>Why this won</h2>
          <p>{selected.whyWinner}</p>
          {selected.iivoImprovements.length > 0 && (
            <>
              <h3>{withIivoWordmark("Where IIVO improved", "bench-improved")}</h3>
              <ul>
                {selected.iivoImprovements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {selected.iivoNotWorthExtra.length > 0 && (
            <>
              <h3>{withIivoWordmark("Where IIVO may not be worth extra cost", "bench-cost")}</h3>
              <ul>
                {selected.iivoNotWorthExtra.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="settings-action-grid">
          <button type="button" className="btn ghost" onClick={() => saveToMemory(selected.id)}>
            Save to Memory
          </button>
          <button type="button" className="btn ghost" onClick={() => deleteRun(selected.id)}>
            Delete benchmark
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="benchmark-lab-panel" data-testid="benchmark-lab-panel">
      <header className="panel-page-header">
        <h1>Benchmark Lab</h1>
        <p className="panel-page-subtitle">
          {withIivoWordmark(
            "IIVO Benchmark Lab compares a single-model answer against IIVO's routed/council response so you can see when orchestration is worth the extra cost. Scores are heuristic estimates — not scientific proof.",
            "bench-subtitle",
          )}
        </p>
      </header>

      <section className="panel-section benchmark-library-section" data-testid="benchmark-prompt-library">
        <div className="benchmark-library-header">
          <h2>Benchmark Prompt Library</h2>
          <button
            type="button"
            className="btn ghost small"
            data-testid="benchmark-recommended-set-btn"
            onClick={handleRecommendedSet}
          >
            Run recommended benchmark set
          </button>
        </div>
        <p className="muted">
          {withIivoWordmark(
            "Strong prompts designed to reveal whether IIVO routing, council, memory, and decision learning create a better answer than one model alone.",
            "bench-library-desc",
          )}
        </p>
        {showRecommendedConfirm && (
          <p className="benchmark-recommended-note muted" data-testid="benchmark-recommended-note">
            This will run {RECOMMENDED_BENCHMARK_SET_COUNT} benchmark
            {RECOMMENDED_BENCHMARK_SET_COUNT === 1 ? "" : "s"} and may use{" "}
            {estimate?.totalCredits ?? "several"} credits. Prompt selected — confirm by clicking Run
            benchmark when ready.
          </p>
        )}

        <div className="benchmark-library-filters">
          <label className="benchmark-field inline">
            <span>Category</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as BenchmarkPromptCategory | "all")}
              data-testid="benchmark-library-category-filter"
            >
              <option value="all">All categories</option>
              {BENCHMARK_PROMPT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
          <label className="benchmark-field inline">
            <span>Difficulty</span>
            <select
              value={difficultyFilter}
              onChange={(e) =>
                setDifficultyFilter(e.target.value as BenchmarkPromptDifficulty | "all")
              }
              data-testid="benchmark-library-difficulty-filter"
            >
              <option value="all">All difficulties</option>
              <option value="simple">Simple</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>

        <ul className="benchmark-library-list">
          {filteredPrompts.map((libraryPrompt) => (
            <li
              key={libraryPrompt.id}
              className={`benchmark-library-item${selectedLibraryId === libraryPrompt.id ? " selected" : ""}`}
              data-testid={`benchmark-library-item-${libraryPrompt.id}`}
            >
              <div className="benchmark-library-item-main">
                <strong>{libraryPrompt.title}</strong>
                <span className="benchmark-library-meta muted">
                  {libraryPrompt.category} · {libraryPrompt.difficulty}
                </span>
                <span className="benchmark-library-route muted">
                  Expected route: {libraryPrompt.expectedBestRoute}
                </span>
              </div>
              <button
                type="button"
                className="btn ghost small"
                data-testid={`benchmark-select-prompt-${libraryPrompt.id}`}
                onClick={() => applyLibraryPrompt(libraryPrompt)}
              >
                Select prompt
              </button>
            </li>
          ))}
        </ul>
        {filteredPrompts.length === 0 && (
          <p className="muted">No prompts match these filters.</p>
        )}
      </section>

      <section className="panel-section benchmark-start-section">
        <h2>Start new benchmark</h2>
        <p className="muted benchmark-warning">
          {withIivoWordmark(
            "Benchmarking this may cost more because it runs both baseline and IIVO.",
            "bench-warning",
          )}
          {isHardLibraryPrompt &&
            " Hard prompts often route to council workflows and use more credits than simple control prompts."}
        </p>

        {selectedLibraryPrompt && (
          <div className="benchmark-selected-prompt-meta" data-testid="benchmark-selected-prompt-meta">
            <h3>{selectedLibraryPrompt.title}</h3>
            <p className="muted">
              <strong>{withIivoWordmark("Why this tests IIVO:", "bench-why")}</strong>{" "}
              {selectedLibraryPrompt.whyThisTestsIIVO}
            </p>
            <p className="muted">
              <strong>Expected best route:</strong> {selectedLibraryPrompt.expectedBestRoute}
            </p>
            {selectedLibraryPrompt.successCriteria.length > 0 && (
              <div className="benchmark-success-criteria-preview">
                <strong>Success criteria (shown before run):</strong>
                <ul data-testid="benchmark-success-criteria-list">
                  {selectedLibraryPrompt.successCriteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <label className="benchmark-field">
          <span>Comparison mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as BenchmarkMode)}>
            {(Object.keys(BENCHMARK_MODE_LABELS) as BenchmarkMode[]).map((key) => (
              <option key={key} value={key}>
                {BENCHMARK_MODE_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="benchmark-field">
          <span>{withIivoWordmark("IIVO workflow", "bench-workflow-label")}</span>
          <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
            <option value="auto">Auto Router</option>
            <option value="product-decision">Product Decision</option>
            <option value="sales-attack">Sales Attack</option>
            <option value="market-research">Market Research</option>
            <option value="competitive-intelligence">Competitive Intelligence</option>
            <option value="technical-audit">Technical Audit</option>
          </select>
        </label>
        <label className="benchmark-field">
          <span>Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              const match = BENCHMARK_PROMPTS.find((p) => p.prompt.trim() === e.target.value.trim());
              if (match) {
                setSelectedLibraryId(match.id);
                setSelectedLibraryPrompt(match);
              } else if (selectedLibraryPrompt && e.target.value.trim() !== selectedLibraryPrompt.prompt.trim()) {
                setSelectedLibraryId(null);
                setSelectedLibraryPrompt(null);
              }
            }}
            rows={4}
            placeholder="Select a prompt from the library or write your own…"
            data-testid="benchmark-prompt-input"
          />
        </label>
        {estimate && (
          <p className="benchmark-estimate muted" data-testid="benchmark-credit-estimate">
            Estimated credits: {estimate.totalCredits} (baseline {estimate.baselineCredits} +{" "}
            <IivoWordmark /> {estimate.iivoCredits} + overhead {estimate.benchmarkOverheadCredits})
            {estimate.remainingAfterRun != null && (
              <> · Remaining after run: ~{Math.max(0, estimate.remainingAfterRun)}</>
            )}
          </p>
        )}
        <button
          type="button"
          className="btn primary"
          disabled={!prompt.trim() || running}
          onClick={() => void runBenchmark()}
          data-testid="benchmark-run-btn"
        >
          {running ? "Running benchmark…" : "Run benchmark"}
        </button>
      </section>

      <section className="panel-section">
        <h2>Past benchmark runs</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="muted">No benchmarks yet.</p>
        ) : (
          <ul className="benchmark-runs-list" data-testid="benchmark-runs-list">
            {runs.map((run) => (
              <li key={run.id} className="benchmark-run-item">
                <button type="button" className="benchmark-run-open" onClick={() => openRun(run.id)}>
                  <strong>{run.promptPreview}</strong>
                  <span className="muted">
                    {BENCHMARK_WINNER_LABELS[run.winner]} · {run.totalCredits} credits ·{" "}
                    {formatRelativeTime(run.timestamp)}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => void deleteRun(run.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
