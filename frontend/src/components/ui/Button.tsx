import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import "./Button.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  icon?: ReactNode;
  /** React 19 entrega `ref` como prop comum; ele segue para o <button> junto com o resto. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={["btn", `btn-${variant}`, `btn-${size}`, className].filter(Boolean).join(" ")}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading ? <span className="btn-spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}
