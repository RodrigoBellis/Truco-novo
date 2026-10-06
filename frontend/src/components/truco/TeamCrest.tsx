import { initials } from "../../utils/format";
import { teamTintStyle } from "../../utils/teamColor";
import "./TeamCrest.css";

interface TeamCrestProps {
  name: string;
  hue?: number;
  size?: "dot" | "sm" | "md" | "lg";
}

/** Escudo da dupla na cor dela. O tamanho "dot" é só a marca de cor, sem iniciais. */
export function TeamCrest({ name, hue, size = "md" }: TeamCrestProps) {
  return (
    <span className={`team-crest team-crest-${size} team-tint`} style={teamTintStyle(hue)} aria-hidden="true">
      {size !== "dot" && initials(name)}
    </span>
  );
}
