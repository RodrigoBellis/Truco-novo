import { Router, type Express } from "express";
import { EDITION_GROUP_IDS, type GroupId } from "@truco/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { store } from "../data/store.js";
import { generateGroupMatches } from "../services/groupMatchesService.js";
import { buildSchedule } from "../services/scheduleBuilder.js";
import { resetAccessRateLimits } from "../services/accessService.js";
import { withChampionshipLock } from "../utils/championshipLock.js";
import { homologationQuery, homologationQueryAsBrowser } from "../data/homologation/pgSupabaseShim.js";
import { FICTITIOUS_PASSWORD, issueFictitiousSession, resetFictitiousPasswords, userFromAccessToken, userFromRefreshToken } from "../data/homologation/fictitiousAuth.js";

// Rotas que só existem no MODO HOMOLOGAÇÃO (app.ts só as monta com TRUCO_HOMOLOGACAO=1).
// Ficam nos mesmos caminhos do modo ensaio para o mesmo roteiro de navegador servir aos dois.

/** Ordem das duplas dentro do grupo: a do seed fictício ("Jogador 1 & Jogador 2" é a primeira). */
const seedOrder = (name: string) => Number(/\d+/.exec(name)?.[0] ?? 0);

/** Volta ao ponto de partida: dados fictícios, 20 jogos sem placar gerados pelas regras do sistema, cadeado fechado. */
async function resetHomologation(): Promise<void> {
  await homologationQuery("select homologacao.reset()");
  resetFictitiousPasswords();
  resetAccessRateLimits();
  const championship = await store.getCurrentChampionship();
  const teams = (await store.listTeams(championship.truco_id)).sort((a, b) => seedOrder(a.name) - seedOrder(b.name));
  const fixtures = Object.fromEntries(EDITION_GROUP_IDS.map((groupId) => [groupId, generateGroupMatches(teams.filter((team) => team.groupId === groupId).map((team) => team.id))])) as Record<GroupId, ReturnType<typeof generateGroupMatches>>;
  await store.createAllGroupMatches(championship.truco_id, fixtures);
  await store.applyScheduleAssignments(buildSchedule(await store.listMatches(championship.truco_id, { stage: "grupos" })));
}

/** Controle da homologação: /api/rehearsal */
export const homologationControlRoutes = Router();

homologationControlRoutes.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const { rows } = await homologationQuery(`
      select pr.truco_id as "accountId", pr.truco_player_id as "playerId", pl.name, pr.role,
        t.truco_id as "teamId", t.name as "teamName", g.label as "groupId"
      from public.truco_profiles pr
      join public.truco_players pl on pl.truco_id = pr.truco_player_id
      left join public.truco_team_memberships m on pr.truco_player_id in (m.truco_player_1_id, m.truco_player_2_id)
        and m.truco_championship_id = (select truco_id from public.truco_championships where status = 'em_andamento' order by edition desc limit 1)
      left join public.truco_teams t on t.truco_id = m.truco_team_id
      left join public.truco_groups g on g.truco_id = t.truco_group_id
      order by pr.role, pl.name`);
    const ids = (await homologationQuery("select homologacao.id('admin') as admin, homologacao.id('jogador-01') as \"firstPlayer\", homologacao.id('dupla-a1') as \"teamA1\"")).rows[0];
    res.json({ rehearsal: true, homologation: true, password: FICTITIOUS_PASSWORD, ids, accounts: rows });
  }),
);

homologationControlRoutes.post(
  "/reset",
  asyncHandler(async (_req, res) => {
    // Na fila do campeonato: o reset não se intercala com um placar ou com o worker de avanço.
    const championship = await store.getCurrentChampionship();
    await withChampionshipLock(championship.truco_id, resetHomologation);
    res.status(204).send();
  }),
);

/**
 * O mínimo do Supabase que o frontend chama direto do navegador. A sessão é a fictícia; o Hall
 * da Fama e a edição atual são lidos do banco local com o papel que o navegador teria
 * (anon/authenticated), então passam pelas políticas RLS copiadas do banco real.
 * O Realtime não é emulado.
 */
export const homologationSupabaseRoutes = Router();

const bearer = (header: string | undefined) => (header ?? "").replace(/^Bearer /, "");

homologationSupabaseRoutes.get("/auth/v1/user", (req, res) => {
  const user = userFromAccessToken(bearer(req.headers.authorization));
  if (!user) {
    res.status(401).json({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return;
  }
  res.json(user);
});

homologationSupabaseRoutes.post("/auth/v1/token", (req, res) => {
  const user = req.query.grant_type === "refresh_token" ? userFromRefreshToken(String(req.body?.refresh_token ?? "")) : null;
  if (!user) {
    res.status(400).json({ code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    return;
  }
  res.json(issueFictitiousSession({ id: user.id, email: user.email }, user.authTime));
});

homologationSupabaseRoutes.post("/auth/v1/logout", (_req, res) => {
  res.status(204).send();
});

const TEAM_JSON = (column: string) => `(
  select jsonb_build_object('name', t.name, 'truco_team_members', coalesce((
    select jsonb_agg(jsonb_build_object('position', m.position, 'truco_players', (select jsonb_build_object('name', p.name) from public.truco_players p where p.truco_id = m.truco_player_id)))
      from public.truco_team_members m where m.truco_team_id = t.truco_id), '[]'::jsonb))
  from public.truco_teams t where t.truco_id = h.${column})`;

homologationSupabaseRoutes.get(
  "/rest/v1/truco_history",
  asyncHandler(async (req, res) => {
    const viewer = userFromAccessToken(bearer(req.headers.authorization));
    const { rows } = await homologationQueryAsBrowser(viewer?.id ?? null, `
      select h.truco_id, h.edition, h.name, h.year, h.final_result, h.notes,
        ${TEAM_JSON("champion_team_id")} as champion, ${TEAM_JSON("runner_up_team_id")} as runner_up
      from public.truco_history h order by h.edition`);
    res.json(rows);
  }),
);

homologationSupabaseRoutes.get(
  "/rest/v1/truco_championships",
  asyncHandler(async (req, res) => {
    const viewer = userFromAccessToken(bearer(req.headers.authorization));
    const { rows } = await homologationQueryAsBrowser(viewer?.id ?? null,
      "select edition, year, name, status, current_phase from public.truco_championships where status = 'em_andamento' order by edition desc limit 1");
    const all: Record<string, unknown> = rows[0] ?? {};
    const columns = typeof req.query.select === "string" && req.query.select !== "*" ? req.query.select.split(",").map((column) => column.trim()) : Object.keys(all);
    const row = Object.fromEntries(columns.filter((column) => column in all).map((column) => [column, all[column]]));
    // .single() pede um objeto; .maybeSingle() e as listas recebem um array.
    res.json(String(req.headers.accept ?? "").includes("vnd.pgrst.object") ? row : [row]);
  }),
);

homologationSupabaseRoutes.get("/rest/v1/{*table}", (_req, res) => {
  res.json([]);
});

/** Monta as rotas da homologação (chamado por server.ts só nesse modo). */
export function mountHomologationRoutes(app: Express): void {
  app.use("/api/rehearsal", homologationControlRoutes);
  app.use(homologationSupabaseRoutes);
}
