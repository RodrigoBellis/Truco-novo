export type UserRole = "admin" | "jogador" | "superadmin";

/**
 * O e-mail não faz parte do Player de propósito. Ele existe só como identificador
 * interno do Supabase Auth (sintético, no formato apelido@trucodonovo.com) e nunca é
 * pedido nem exibido — o login é por playerId. Fica restrito ao backend.
 */
export interface Player {
  id: string;
  name: string;
  role: UserRole;
  teamId: string | null;
  avatarUrl: string | null;
}
