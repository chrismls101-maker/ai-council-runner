import { send } from "../useGlassState.ts";
import { CopyButton } from "../components/CopyButton.tsx";
import type { GlassSession, GlassSessionInsight } from "../../shared/sessionTypes.ts";
import { INSIGHT_TYPE_LABELS } from "../../shared/sessionIntelligence.ts";
import type { GlassInsightType } from "../../shared/sessionTypes.ts";

// ---------- Insights tab ----------
const INSIGHT_ORDER: GlassInsightType[] = [
  "key_idea",
  "hypothesis",
  "risk",
  "action",
  "question",
  "memory_candidate",
];

export function InsightCard({ insight }: { insight: GlassSessionInsight }): JSX.Element {
  return (
    <div className={`moment insight insight--${insight.importance} ${insight.accepted ? "insight--accepted" : ""}`}>
      <div className="moment__meta">
        <span className="moment__kind">{INSIGHT_TYPE_LABELS[insight.type]}</span>
        <span>{insight.accepted ? "★ kept" : insight.importance}</span>
      </div>
      <div className="moment__note">{insight.text}</div>
      <div className="moment__actions">
        {!insight.accepted ? (
          <button className="gbtn" onClick={() => send({ type: "session-accept-insight", id: insight.id })}>
            Keep
          </button>
        ) : null}
        <button
          className="gbtn gbtn--danger"
          onClick={() => send({ type: "session-dismiss-insight", id: insight.id })}
        >
          Dismiss
        </button>
        <button className="gbtn" onClick={() => send({ type: "session-save-insight-moment", id: insight.id })}>
          Save
        </button>
        <button className="gbtn" onClick={() => send({ type: "session-send-insight", id: insight.id })}>
          Send
        </button>
        <CopyButton className="gbtn gbtn--ghost" text={insight.text}>
          Copy
        </CopyButton>
      </div>
    </div>
  );
}

export function InsightsView({ session }: { session: GlassSession | null }): JSX.Element {
  if (!session) return <p className="empty">Start a session to extract live insights.</p>;
  const grouped = INSIGHT_ORDER.map((type) => ({
    type,
    items: session.insights.filter((i) => i.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <div className="transcript__row">
        <button
          className="gbtn gbtn--primary"
          onClick={() => send({ type: "session-extract-insights" })}
        >
          Extract Insights
        </button>
      </div>
      {grouped.length === 0 ? (
        <p className="empty">
          No insights yet. Add notes / transcript, then Extract Insights. (Deterministic,
          local — no LLM calls.)
        </p>
      ) : (
        grouped.map((g) => (
          <div key={g.type}>
            <p className="section-title">{INSIGHT_TYPE_LABELS[g.type]}</p>
            {g.items.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        ))
      )}
    </>
  );
}
