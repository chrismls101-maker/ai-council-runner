import type { DiffLine } from "../../shared/diff.ts";

export function GlassDiffView({ lines }: { lines: DiffLine[] }): JSX.Element {
  return (
    <pre className="glass-diff__body">
      {lines.map((line, i) => {
        if (line.collapsed !== undefined) {
          return (
            <div key={i} className="glass-diff__line glass-diff__line--sentinel">
              ⋯ {line.collapsed} unchanged {line.collapsed === 1 ? "line" : "lines"}
            </div>
          );
        }
        const cls =
          line.op === "add"
            ? "glass-diff__line glass-diff__line--add"
            : line.op === "remove"
              ? "glass-diff__line glass-diff__line--remove"
              : "glass-diff__line glass-diff__line--equal";
        const prefix = line.op === "add" ? "+" : line.op === "remove" ? "−" : " ";
        return (
          <div key={i} className={cls}>
            <span className="glass-diff__gutter">{prefix}</span>
            <span className="glass-diff__text">{line.text}</span>
          </div>
        );
      })}
    </pre>
  );
}
