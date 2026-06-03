import type { TableDiffResult } from "../../utils/artifactDiff";

export default function TableDiffView({ diff }: { diff: TableDiffResult }) {
  return (
    <div className="table-diff-view" data-testid="table-diff-view">
      {diff.addedRows.length > 0 && (
        <section>
          <h5>Added rows</h5>
          <ul>
            {diff.addedRows.map((row, i) => (
              <li key={`add-${i}`} className="diff-add" data-testid="table-diff-added-row">
                {Object.entries(row)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </section>
      )}
      {diff.removedRows.length > 0 && (
        <section>
          <h5>Removed rows</h5>
          <ul>
            {diff.removedRows.map((row, i) => (
              <li key={`rem-${i}`} className="diff-remove" data-testid="table-diff-removed-row">
                {Object.entries(row)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </section>
      )}
      {diff.changedCells.length > 0 && (
        <section>
          <h5>Changed cells</h5>
          <ul>
            {diff.changedCells.map((cell, i) => (
              <li key={`cell-${i}`} className="diff-changed" data-testid="table-diff-changed-cell">
                {cell.column}: {cell.before} → {cell.after}
              </li>
            ))}
          </ul>
        </section>
      )}
      {diff.totalsChanged.length > 0 && (
        <section>
          <h5>Totals changed</h5>
          <ul>
            {diff.totalsChanged.map((t) => (
              <li key={t.key} data-testid="table-diff-total-change">
                {t.key}: {t.before} → {t.after}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
