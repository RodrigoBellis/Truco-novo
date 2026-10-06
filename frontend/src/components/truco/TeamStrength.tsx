import { Icon } from "../ui/Icon";
import "./TeamStrength.css";

export function TeamStrength({ value, compact = false }: { value?: number; compact?: boolean }) {
  if (value == null || !Number.isInteger(value) || value < 1 || value > 5) return <span className="team-strength team-strength-pending">Força a definir</span>;
  const strength = value;
  return <span className={`team-strength${compact ? " team-strength-compact" : ""}`} aria-label={`Força ${strength} de 5`}>
    <span className="team-strength-stars" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} className={index < strength ? "star-filled" : "star-empty"}><Icon name="star" size={compact ? 12 : 17} /></span>)}</span>
    <span className="team-strength-value">{compact ? `${strength}/5` : `Força ${strength}/5`}</span>
  </span>;
}
