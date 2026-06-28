import type { JSX } from "react";
import type { GlassIntroPhase } from "./glassCinematicIntro";
import { INTRO_AGENT_CATALOG } from "./glassIntroAgentsCatalog";

const AGENTS_VISIBLE: GlassIntroPhase[] = ["open-agents", "cursor-coder", "coder-click"];

function isAgentsOpen(phase: GlassIntroPhase): boolean {
  return AGENTS_VISIBLE.includes(phase);
}

/** Full agents column — live catalog + coming-soon runway. */
export default function GlassIntroAgentsPanel({ phase }: { phase: GlassIntroPhase }): JSX.Element | null {
  if (!isAgentsOpen(phase)) return null;

  const highlightCoder = phase === "cursor-coder" || phase === "coder-click";
  const liveCount = INTRO_AGENT_CATALOG.filter((a) => a.status === "live").length;
  const soonCount = INTRO_AGENT_CATALOG.filter((a) => a.status === "soon").length;

  return (
    <aside
      className={`glass-intro-agents${highlightCoder ? " glass-intro-agents--coder-target" : ""}`}
      data-testid="glass-intro-agents-panel"
      aria-hidden="true"
    >
      <header className="glass-intro-agents__head">
        <span className="glass-intro-agents__dot" />
        <span>Glass Agents</span>
        <span className="glass-intro-agents__count">
          {liveCount} live · {soonCount} coming soon
        </span>
      </header>

      <div className="glass-intro-agents__list">
        {INTRO_AGENT_CATALOG.map((agent) => (
          <article
            key={agent.id}
            data-intro-agent={agent.id}
            className={[
              "glass-intro-agents__card",
              agent.status === "soon" ? "glass-intro-agents__card--soon" : "",
              agent.id === "coder" && highlightCoder ? "glass-intro-agents__card--focus" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="glass-intro-agents__card-top">
              <span className="glass-intro-agents__icon" aria-hidden="true">
                {agent.icon}
              </span>
              <div>
                <p className="glass-intro-agents__name">{agent.name}</p>
                {agent.status === "soon" ? (
                  <span className="glass-intro-agents__badge">Coming soon</span>
                ) : agent.id === "coder" ? (
                  <span className="glass-intro-agents__badge glass-intro-agents__badge--ide">Built-in IDE</span>
                ) : (
                  <span className="glass-intro-agents__badge glass-intro-agents__badge--live">Live</span>
                )}
              </div>
            </div>
            <p className="glass-intro-agents__desc">{agent.description}</p>
          </article>
        ))}
      </div>
    </aside>
  );
}
