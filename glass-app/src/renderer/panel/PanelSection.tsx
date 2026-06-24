import type { ReactNode } from "react";

export type PanelSectionProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
};

export function PanelSection({
  title,
  description,
  actions,
  children,
  className,
  testId,
}: PanelSectionProps): JSX.Element {
  return (
    <section
      className={`panel-section${className ? ` ${className}` : ""}`}
      data-testid={testId}
    >
      <header className="panel-section__head">
        <div className="panel-section__titles">
          <h2 className="panel-section__title">{title}</h2>
          {description ? <p className="panel-section__desc">{description}</p> : null}
        </div>
        {actions ? <div className="panel-section__actions">{actions}</div> : null}
      </header>
      <div className="panel-section__body">{children}</div>
    </section>
  );
}
