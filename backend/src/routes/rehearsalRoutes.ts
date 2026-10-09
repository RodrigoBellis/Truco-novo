import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { REHEARSAL_PASSWORD, rehearsalStore } from "../data/rehearsalStore.js";
import { accountFromAccessToken, accountFromRefreshToken, issueRehearsalSession, supabaseUserPayload } from "../data/rehearsalAuth.js";

// Rotas que só existem no MODO ENSAIO (app.ts só as monta com TRUCO_REHEARSAL=1).

/** Controle do ensaio: /api/rehearsal */
export const rehearsalRoutes = Router();

/** Contas fictícias e a senha do ensaio, para os testes escolherem com quem entrar. */
rehearsalRoutes.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const store = rehearsalStore();
    const players = await store.listPlayers();
    const teams = await store.listTeams("");
    res.json({
      rehearsal: true,
      password: REHEARSAL_PASSWORD,
      // Ids fixos que o roteiro de navegador cita (na homologação eles são UUIDs).
      ids: { admin: "ensaio-admin", firstPlayer: "ensaio-jogador-01", teamA1: "ensaio-dupla-a1" },
      accounts: store.accounts().map((account) => {
        const player = players.find((item) => item.id === account.playerId);
        const team = teams.find((item) => item.id === player?.teamId);
        return { accountId: account.id, playerId: account.playerId, name: player?.name ?? "—", role: account.role, teamId: team?.id ?? null, teamName: team?.name ?? null, groupId: team?.groupId ?? null };
      }),
    });
  }),
);

/** Volta ao ponto de partida (20 jogos sem placar, cadeado fechado). Os tokens já emitidos continuam valendo. */
rehearsalRoutes.post("/reset", (_req, res) => {
  rehearsalStore().reset();
  res.status(204).send();
});

/**
 * O mínimo do Supabase que o frontend chama direto do navegador, servido da memória do ensaio:
 * a sessão (supabase.auth.setSession / renovação / saída) e a leitura do Hall da Fama. Com
 * VITE_SUPABASE_URL apontando para este backend, o navegador não fala com o Supabase real.
 * O Realtime não é emulado (a conexão falha e as telas seguem pela consulta normal).
 */
export const rehearsalSupabaseRoutes = Router();

rehearsalSupabaseRoutes.get("/auth/v1/user", (req, res) => {
  const account = accountFromAccessToken((req.headers.authorization ?? "").replace(/^Bearer /, ""));
  if (!account) {
    res.status(401).json({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return;
  }
  res.json(supabaseUserPayload(account));
});

rehearsalSupabaseRoutes.post("/auth/v1/token", (req, res) => {
  const account = req.query.grant_type === "refresh_token" ? accountFromRefreshToken(String(req.body?.refresh_token ?? "")) : null;
  if (!account) {
    res.status(400).json({ code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    return;
  }
  const session = issueRehearsalSession(account);
  res.json({ access_token: session.token, refresh_token: session.refreshToken, token_type: "bearer", expires_in: session.expiresIn, expires_at: session.expiresAt, user: supabaseUserPayload(account) });
});

rehearsalSupabaseRoutes.post("/auth/v1/logout", (_req, res) => {
  res.status(204).send();
});

rehearsalSupabaseRoutes.get(
  "/rest/v1/truco_history",
  asyncHandler((_req, res) => {
    res.json(rehearsalStore().hallOfFameRows());
  }),
);

rehearsalSupabaseRoutes.get(
  "/rest/v1/truco_championships",
  asyncHandler(async (req, res) => {
    const championship = await rehearsalStore().getCurrentChampionship();
    const all: Record<string, unknown> = { edition: championship.edition, year: championship.year, name: championship.name, status: championship.status, current_phase: championship.current_phase };
    const columns = typeof req.query.select === "string" && req.query.select !== "*" ? req.query.select.split(",").map((column) => column.trim()) : Object.keys(all);
    const row = Object.fromEntries(columns.filter((column) => column in all).map((column) => [column, all[column]]));
    // .single() pede um objeto; .maybeSingle() e as listas recebem um array.
    res.json(String(req.headers.accept ?? "").includes("vnd.pgrst.object") ? row : [row]);
  }),
);

rehearsalSupabaseRoutes.get("/rest/v1/{*table}", (_req, res) => {
  res.json([]);
});
