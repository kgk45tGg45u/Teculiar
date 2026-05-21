import type { HTMLAttributes, ReactNode } from "react";

function joinClass(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type PageHeaderProps = HTMLAttributes<HTMLElement> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <header className={joinClass("page-header", className)} {...props}>
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={joinClass("empty-state", className)} {...props} />;
}

type MetricCardProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
};

export function MetricCard({ label, value, hint, className, ...props }: MetricCardProps) {
  return (
    <div className={joinClass("compact-card", "metric-card", className)} {...props}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

export function InfoGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={joinClass("info-grid", className)} {...props} />;
}
