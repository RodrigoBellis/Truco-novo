import type { ReactNode } from "react";
import "./EmptyState.css";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** "danger" destaca falhas de carregamento; "default" para estados vazios normais. */
  tone?: "default" | "danger";
}

export function EmptyState({ icon, title, description, action, tone = "default" }: EmptyStateProps) {
  return (
    <div className={`empty-state empty-state-${tone}`} role={tone === "danger" ? "alert" : undefined}>
      <div className="empty-state-icon">{icon ?? "🃏"}</div>
      <h3>{title}</h3>
      {description && <p className="text-muted">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
