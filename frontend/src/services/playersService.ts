import type { Player } from "@truco/shared";
import { apiRequest } from "./api";

/** Item da listagem pública usada na tela de login — sem e-mail. */
export interface RosterPlayer {
  id: string;
  name: string;
}

/** Público: só id e nome. É o que a tela de login consegue ler sem sessão. */
export function getRoster(): Promise<RosterPlayer[]> {
  return apiRequest<RosterPlayer[]>("/players/roster");
}

/** Requer sessão — inclui e-mail e dupla. */
export function getPlayers(): Promise<Player[]> {
  return apiRequest<Player[]>("/players");
}

export function createPlayer(name: string): Promise<Player> {
  return apiRequest<Player>("/players", { method: "POST", body: { name } });
}

/** Envia a nova foto de perfil (data URL base64, já redimensionada no cliente). */
export function uploadMyAvatar(imageDataUrl: string): Promise<{ avatarUrl: string }> {
  return apiRequest<{ avatarUrl: string }>("/players/me/avatar", { method: "POST", body: { imageDataUrl } });
}
