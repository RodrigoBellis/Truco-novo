import "./Skeleton.css";

interface SkeletonProps {
  /** Altura da barra. Aceita qualquer valor CSS. */
  height?: string;
  /** Largura da barra. Aceita qualquer valor CSS. */
  width?: string;
  radius?: "sm" | "md" | "lg" | "full";
}

export function Skeleton({ height = "16px", width = "100%", radius = "sm" }: SkeletonProps) {
  return <span className={`skeleton skeleton-${radius}`} style={{ height, width }} aria-hidden="true" />;
}

interface SkeletonCardsProps {
  count?: number;
  /** Altura de cada bloco simulado. */
  height?: string;
}

/** Placeholder com o formato de uma grade de cards, para telas que carregam listas. */
export function SkeletonCards({ count = 4, height = "108px" }: SkeletonCardsProps) {
  return (
    <div className="skeleton-cards" role="status" aria-label="Carregando conteúdo">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={height} radius="lg" />
      ))}
    </div>
  );
}
