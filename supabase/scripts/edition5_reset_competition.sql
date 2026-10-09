-- Zera SOMENTE a competição da 5ª edição: jogos, placares, fila de mesas, mata-mata e decisões
-- de empate. NÃO toca em jogadores, contas, duplas, participações, Hall da Fama nem edições
-- anteriores.
--
-- É um único comando (bloco DO): ou tudo acontece, ou nada acontece — não depende de o
-- cliente SQL manter uma transação aberta.
--
-- Como usar:
--   1. Rode edition5_precheck.sql e guarde a saída.
--   2. Rode este arquivo como está (v_ensaio = true). Ele faz a limpeza, confere as travas e
--      termina com um erro proposital "ENSAIO", que desfaz tudo. Leia as contagens na mensagem.
--   3. Só então troque v_ensaio para false e rode de novo: agora grava.
--   4. Rode edition5_precheck.sql outra vez: as linhas "hall" e "campeoes" têm de estar iguais.
do $$
declare
  v_ensaio constant boolean := true;  -- true = nada é gravado; false = grava.

  v_edition uuid;
  v_history_before bigint;
  v_champions_before text;
  v_teams_before bigint;
  v_memberships_before bigint;
  v_players_before bigint;
  v_profiles_before bigint;
  v_matches bigint;
  v_bracket bigint;
  v_overrides bigint;
begin
  select truco_id into strict v_edition from public.truco_championships where edition = 5 and status = 'em_andamento';

  select count(*), string_agg(edition || ':' || coalesce(champion_team_id::text, 'nulo') || ':' || coalesce(runner_up_team_id::text, 'nulo'), ',' order by edition)
    into v_history_before, v_champions_before from public.truco_history;
  select count(*) into v_teams_before from public.truco_teams;
  select count(*) into v_memberships_before from public.truco_team_memberships;
  select count(*) into v_players_before from public.truco_players;
  select count(*) into v_profiles_before from public.truco_profiles;

  -- O mata-mata vai primeiro: ele aponta para os jogos.
  delete from public.truco_bracket_matches where truco_championship_id = v_edition;
  get diagnostics v_bracket = row_count;
  delete from public.truco_standings_overrides where truco_championship_id = v_edition;
  get diagnostics v_overrides = row_count;
  delete from public.truco_matches where truco_championship_id = v_edition;
  get diagnostics v_matches = row_count;

  -- Registros de lançamento/correção de placar dos testes (aparecem na auditoria do admin).
  delete from public.truco_audit_log where truco_championship_id = v_edition and entity = 'match_result';

  -- Volta a edição ao ponto "duplas definidas, jogos ainda não gerados" e deixa o cadeado de
  -- resultados FECHADO. Exige a migration 202610070002_results_lock.sql já aplicada; sem ela
  -- este comando falha e nada é gravado.
  update public.truco_championships set current_phase = 'Aguardando sorteio', draw_status = 'pendente', results_locked = true where truco_id = v_edition;

  -- Travas: se qualquer coisa fora da competição mudou, nada é gravado.
  if (select count(*) from public.truco_history) <> v_history_before
     or (select string_agg(edition || ':' || coalesce(champion_team_id::text, 'nulo') || ':' || coalesce(runner_up_team_id::text, 'nulo'), ',' order by edition) from public.truco_history) is distinct from v_champions_before then
    raise exception 'Hall da Fama mudou durante a limpeza; nada foi gravado.';
  end if;
  if (select count(*) from public.truco_teams) <> v_teams_before
     or (select count(*) from public.truco_team_memberships) <> v_memberships_before
     or (select count(*) from public.truco_players) <> v_players_before
     or (select count(*) from public.truco_profiles) <> v_profiles_before then
    raise exception 'Duplas, participações, jogadores ou contas mudaram durante a limpeza; nada foi gravado.';
  end if;
  if exists (select 1 from public.truco_matches where truco_championship_id = v_edition) then
    raise exception 'Sobrou jogo da 5ª edição; nada foi gravado.';
  end if;

  if v_ensaio then
    raise exception 'ENSAIO (nada foi gravado): seriam removidos % jogos, % confrontos de mata-mata e % decisões de empate. Preservados: % edições no Hall da Fama, % duplas, % participações, % jogadores, % contas.',
      v_matches, v_bracket, v_overrides, v_history_before, v_teams_before, v_memberships_before, v_players_before, v_profiles_before;
  end if;
  raise notice 'GRAVADO: removidos % jogos, % confrontos de mata-mata e % decisões de empate. Hall da Fama, duplas, jogadores e contas preservados.', v_matches, v_bracket, v_overrides;
end $$;
