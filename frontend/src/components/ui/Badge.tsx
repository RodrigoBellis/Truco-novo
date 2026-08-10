import type { ReactNode } from "react";
import "./Badge.css";

type Tone = "neutral" | "gold" | "green" | "danger" | "info";

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
}

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
