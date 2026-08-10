import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import "./AnimatedBorderCard.css";

interface AnimatedBorderCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Duração de uma volta completa do brilho, em segundos. */
  duration?: number;
  /** Espessura da borda animada, em pixels. */
  beamWidth?: number;
  /** Raio da borda (deve casar com o elemento interno). */
  radius?: string;
  /** Usa display inline-block — útil para envolver botões. */
  inline?: boolean;
  /** Permite desligar o brilho sem remontar o elemento (evita perder transições em curso). */
  enabled?: boolean;
}

export function AnimatedBorderCard({
  children,
  duration = 3.5,
  beamWidth = 1.5,
  radius = "var(--radius-lg)",
  inline = false,
  enabled = true,
  className,
  style,
  ...rest
}: AnimatedBorderCardProps) {
  const cssVars = {
    "--abc-duration": `${duration}s`,
    "--abc-beam-width": `${beamWidth}px`,
    "--abc-radius": radius,
  } as CSSProperties;

  return (
    <div
      className={[
        "animated-border-card",
        inline ? "animated-border-card-inline" : "",
        enabled ? "" : "animated-border-card-off",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...cssVars, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
