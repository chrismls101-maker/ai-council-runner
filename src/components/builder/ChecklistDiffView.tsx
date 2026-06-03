import type { ChecklistDiffResult } from "../../utils/artifactDiff";

export default function ChecklistDiffView({ diff }: { diff: ChecklistDiffResult }) {
  return (
    <div className="checklist-diff-view" data-testid="checklist-diff-view">
      <ul>
        {diff.changes.map((change) => (
          <li
            key={`${change.type}-${change.label}`}
            className={`diff-${change.type}`}
            data-testid={`checklist-diff-${change.type}`}
          >
            <strong>{change.label}</strong>
            {change.type === "added" && change.after && (
              <span>
                {" "}
                — checked: {String(change.after.checked ?? false)}
                {change.after.note ? ` · ${change.after.note}` : ""}
              </span>
            )}
            {change.type === "removed" && change.before && (
              <span>
                {" "}
                — was checked: {String(change.before.checked ?? false)}
              </span>
            )}
            {change.type === "changed" && (
              <span>
                {" "}
                — {String(change.before?.checked ?? false)} → {String(change.after?.checked ?? false)}
                {(change.before?.note ?? "") !== (change.after?.note ?? "") &&
                  ` · note: ${change.before?.note ?? ""} → ${change.after?.note ?? ""}`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
