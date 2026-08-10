import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  interactive?: boolean;
  accent?: "none" | "gold" | "green";
}

export function Card({ children, interactive = false, accent = "none", className, ...rest }: CardProps) {
  return (
    <div
      className={["card", interactive ? "card-interactive" : "", `card-accent-${accent}`, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
