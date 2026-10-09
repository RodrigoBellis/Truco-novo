import type { Player } from "@truco/shared";

/**
 * Quem participa oficialmente da edição atual: jogador com dupla (participação) nela.
 * Campeão de edição passada sem dupla na atual existe só para o Hall da Fama — não aparece
 * nas cartas de login nem recebe conta até entrar numa dupla oficial.
 */
export function isCurrentEditionParticipant(player: Pick<Player, "role" | "teamId">): boolean {
  return player.role === "jogador" && player.teamId !== null;
}

/** Lista pública da tela de login: só id e nome dos participantes da edição atual. */
export function loginRoster(players: readonly Player[]): Array<{ id: string; name: string }> {
  return players.filter(isCurrentEditionParticipant).map((player) => ({ id: player.id, name: player.name }));
}
