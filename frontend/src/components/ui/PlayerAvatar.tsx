import { initials } from "../../utils/format";
import "./PlayerAvatar.css";

interface PlayerAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}

/** Foto pública do jogador, com iniciais como fallback quando não existe imagem. */
export function PlayerAvatar({ name, avatarUrl, size = "md" }: PlayerAvatarProps) {
  return (
    <span className={`player-avatar player-avatar-${size}`} aria-hidden="true">
      <span>{initials(name)}</span>
      {avatarUrl && <img src={avatarUrl} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.hidden = true; }} />}
    </span>
  );
}
