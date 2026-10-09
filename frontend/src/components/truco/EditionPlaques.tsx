import type { CSSProperties } from "react";
import "./EditionPlaques.css";

/**
 * Plaquinhas de edição: o único jeito de mostrar as edições conquistadas por uma dupla
 * (pódio histórico e lista de Maiores Campeões). Lembram a placa gravada no pedestal do caneco.
 * As tintas vêm de `--plaque-*`, definidas por quem usa (ouro/prata no pódio); sem elas a
 * plaquinha é neutra, pelos tokens do tema.
 */
export function EditionPlaques({ editions, className }: { editions: number[]; className?: string }) {
  if (editions.length === 0) return null;
  return (
    <ul className={`edition-plaques${className ? ` ${className}` : ""}`} aria-label="Edições conquistadas">
      {editions.map((edition, index) => (
        <li key={edition} className="edition-plaque" style={{ "--plaque-index": index } as CSSProperties}>
          <b>{edition}ª</b> edição
        </li>
      ))}
    </ul>
  );
}
