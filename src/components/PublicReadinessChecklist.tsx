import {
  PUBLIC_READINESS_CHECKLIST,
  READINESS_STATUS_LABELS,
  type ReadinessStatus,
} from "../constants/publicReadinessChecklist";
import { withIivoWordmark } from "../utils/brandText";

function statusClass(status: ReadinessStatus): string {
  return `readiness-status readiness-status-${status.replace("_", "-")}`;
}

export default function PublicReadinessChecklist() {
  return (
    <section
      className="panel-section public-readiness-checklist"
      data-testid="public-readiness-checklist"
    >
      <h2>Public Readiness Checklist</h2>
      <p className="muted">
        Working checklist for beta readiness — statuses are manual, not automated certification.
      </p>
      <div className="readiness-checklist-sections">
        {PUBLIC_READINESS_CHECKLIST.map((section) => (
          <div
            key={section.id}
            className="readiness-checklist-section"
            data-testid={`readiness-section-${section.id}`}
          >
            <h3>{section.title}</h3>
            <ul className="readiness-checklist-items">
              {section.items.map((item) => (
                <li key={item.id} className="readiness-checklist-item">
                  <span>{withIivoWordmark(item.label, item.id)}</span>
                  <span className={statusClass(item.status)}>
                    {READINESS_STATUS_LABELS[item.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
