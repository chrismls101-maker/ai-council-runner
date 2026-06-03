import { useState } from "react";
import ProviderDisclosureTable from "./ProviderDisclosureTable";
import PublicReadinessChecklist from "./PublicReadinessChecklist";
import {
  DATA_USE_STATEMENT,
  LAUNCH_CHECKLIST_ITEMS,
  SENSITIVE_DATA_GUIDANCE,
} from "../constants/providerDisclosure";
import { BETA_STORAGE_NOTE, BETA_WORKSPACE_LABEL } from "../constants/publicMessages";
import { withIivoWordmark } from "../utils/brandText";

interface TrustPrivacyPanelProps {
  onOpenSettings?: () => void;
}

export default function TrustPrivacyPanel({ onOpenSettings }: TrustPrivacyPanelProps) {
  const [checklistOpen, setChecklistOpen] = useState(false);

  return (
    <div className="trust-privacy-panel">
      <header className="panel-page-header">
        <h1>Trust & Privacy</h1>
        <p className="panel-page-subtitle">
          {withIivoWordmark(
            "Visibility, control, and transparency for how IIVO processes your decisions.",
            "trust-subtitle",
          )}
        </p>
        <p className="beta-workspace-label" data-testid="beta-workspace-label">
          {BETA_WORKSPACE_LABEL}
        </p>
        <p className="beta-storage-note muted">{BETA_STORAGE_NOTE}</p>
      </header>

      <section className="panel-section">
        <h2>Transparency</h2>
        <p>
          {withIivoWordmark(
            "IIVO is designed around visibility and control. You can see memory usage, sources, execution trace, estimated costs, and provider/model details where available. Costs are estimates where available; sources depend on provider responses.",
            "trust-transparency",
          )}
        </p>
      </section>

      <section className="panel-section">
        <h2>Context Bridge</h2>
        <p data-testid="context-bridge-trust-copy">
          {withIivoWordmark(
            "Context Bridge lets you manually provide outside text or URLs for IIVO to analyze. Context is used only when you attach it to a prompt or save it to the Context Library. User-pasted context is not independently verified. Imported web pages may be incomplete, blocked, or unavailable — IIVO does not support private or logged-in pages automatically. Provider APIs may process attached context during a run. Memory is separate from the Context Library; saving context to Memory requires an explicit action.",
            "trust-context-bridge",
          )}
        </p>
        <p data-testid="iivo-lens-trust-copy">
          {withIivoWordmark(
            "IIVO Lens can send selected browser page context into IIVO. It only sends context after you click an action in the extension. It does not continuously monitor your browser. IIVO Lens can capture the visible part of the current browser tab only after you click the screenshot action. IIVO can visually analyze screenshots only when image analysis is enabled and only for screenshots you explicitly capture or attach. Image analysis may be imperfect. Review outputs before acting. Some pages may block capture or produce incomplete text.",
            "trust-lens",
          )}
        </p>
      </section>

      <section className="panel-section">
        <h2>Memory Control</h2>
        <p>
          {withIivoWordmark(
            "Memory is stored in this workspace and can be edited or deleted. IIVO shows when memory is included in a run. Past outcomes are not treated as proof unless you mark them as worked.",
            "trust-memory",
          )}
        </p>
      </section>

      <section className="panel-section">
        <h2>Provider Processing</h2>
        <p>
          {withIivoWordmark(
            "When you run a decision, IIVO may send the current prompt, selected memory/context, and workflow outputs to configured AI providers to generate responses. Provider APIs process requests according to their own policies.",
            "trust-provider",
          )}
        </p>
      </section>

      <section className="panel-section">
        <h2>Cost & Source Visibility</h2>
        <p>
          {withIivoWordmark(
            "IIVO shows estimated usage and provider cost where available — including credits for each workflow, model token costs, search request costs, sources, and execution trace. Credits are a local simulation until billing is added.",
            "trust-cost",
          )}
        </p>
      </section>

      <section className="panel-section">
        <h2>Data Controls</h2>
        <p>
          You can export or delete run history, memory, benchmark comparisons, and local audit logs
          from Settings or Benchmark Lab.
        </p>
        {onOpenSettings && (
          <button type="button" className="btn ghost small" onClick={onOpenSettings}>
            Open Settings
          </button>
        )}
      </section>

      <section className="panel-section" data-testid="provider-disclosure-section">
        <h2>Provider Disclosure</h2>
        <ProviderDisclosureTable />
      </section>

      <section className="panel-section">
        <h2>Data Use</h2>
        <p className="panel-statement" data-testid="data-use-statement">
          {withIivoWordmark(DATA_USE_STATEMENT, "data-use")}
        </p>
      </section>

      <PublicReadinessChecklist />

      <section className="panel-section panel-section-launch">
        <button
          type="button"
          className="launch-checklist-toggle"
          onClick={() => setChecklistOpen((o) => !o)}
          aria-expanded={checklistOpen}
        >
          Launch Checklist
          <span aria-hidden="true">{checklistOpen ? "−" : "+"}</span>
        </button>
        {checklistOpen && (
          <div className="launch-checklist">
            <p>
              {withIivoWordmark(
                "These are the core systems required before opening IIVO broadly to public users.",
                "trust-launch",
              )}
            </p>
            <ul>
              {LAUNCH_CHECKLIST_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
              <li>Public pricing tiers (Free, Starter, Pro/Founder, Business, Enterprise)</li>
            </ul>
          </div>
        )}
      </section>

      <section className="panel-section">
        <h2>Sensitive Data Guidance</h2>
        <p className="panel-guidance">{SENSITIVE_DATA_GUIDANCE}</p>
      </section>
    </div>
  );
}
