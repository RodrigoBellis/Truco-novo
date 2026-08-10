import type { ReactNode } from "react";
import { Card } from "./Card";
import "./StatCard.css";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "gold" | "green" | "neutral" | "danger";
  hint?: string;
}

export function StatCard({ label, value, icon, tone = "neutral", hint }: StatCardProps) {
  return (
    <Card className={`stat-card stat-card-${tone}`}>
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        {icon && <span className="stat-card-icon">{icon}</span>}
      </div>
      <strong className="stat-card-value">{value}</strong>
      {hint && <span className="stat-card-hint text-faint">{hint}</span>}
    </Card>
  );
}
