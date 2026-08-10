import "./Loading.css";

interface LoadingProps {
  label?: string;
  fullHeight?: boolean;
}

export function Loading({ label = "Carregando...", fullHeight = false }: LoadingProps) {
  return (
    <div className={["loading-wrap", fullHeight ? "loading-full" : ""].filter(Boolean).join(" ")}>
      <span className="loading-ring" aria-hidden="true" />
      <p className="text-muted">{label}</p>
    </div>
  );
}
