import { useId, useState } from "react";
import type { ReactNode } from "react";
import "./Disclosure.css";

interface DisclosureProps {
  /** Rótulo sempre visível, mesmo fechado. */
  label: ReactNode;
  /** Conteúdo revelado ao expandir — dados secundários, detalhes, listas longas. */
  children: ReactNode;
  /** Começa aberto (ex.: quando o usuário já demonstrou interesse na seção). */
  defaultOpen?: boolean;
  /** Ícone opcional exibido antes do rótulo. */
  icon?: ReactNode;
}

/**
 * Bloco de progressive disclosure reutilizável: mostra um resumo/rótulo e
 * esconde detalhes secundários atrás de um "ver mais". Usado para reduzir a
 * quantidade de informação exposta de uma vez em telas densas (dashboards,
 * listas de jogos, estatísticas administrativas).
 */
export function Disclosure({ label, children, defaultOpen = false, icon }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={`disclosure${open ? " disclosure-open" : ""}`}>
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        {icon && <span className="disclosure-icon">{icon}</span>}
        <span className="disclosure-label">{label}</span>
        <span className="disclosure-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      <div id={contentId} className="disclosure-content" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
