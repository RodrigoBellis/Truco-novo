-- HOMOLOGAÇÃO LOCAL — nunca executar no Supabase.
-- Dados 100% fictícios, com o mesmo desenho do modo ensaio em memória (rehearsalStore.ts):
-- 14 jogadores em 7 duplas (grupo único, formato de 14/10/2026), 2 jogadores que só existem no
-- histórico, 1 administrador, 4 edições antigas encerradas e a 5ª edição em andamento, com o
-- cadeado fechado. Os 21 jogos de grupo NÃO são criados aqui: o backend de homologação os gera pelas regras do
-- sistema (generateGroupMatches + buildSchedule) logo depois do reset.
--
-- Os ids são UUIDs derivados de um rótulo estável (md5), para os testes poderem citá-los.

create or replace function homologacao.id(p_label text) returns uuid
language sql immutable set search_path = '' as $$ select md5('truco-homologacao:' || p_label)::uuid $$;

create or replace function homologacao.reset() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_group text;
  v_slot integer;
  v_team uuid;
  v_first integer;
  v_edition integer;
  v_champions text[] := array['dupla-a1', 'dupla-a1', 'dupla-historica', 'dupla-a2'];
begin
  if not exists (select 1 from homologacao.ambiente where nome = 'truco-homologacao-local') then
    raise exception 'Marcador de homologação ausente: reset recusado.';
  end if;
  if inet_server_addr() is not null and not (inet_server_addr() << '127.0.0.0/8'::inet or inet_server_addr() = '::1'::inet) then
    raise exception 'Reset recusado fora de 127.0.0.1.';
  end if;

  truncate public.truco_bracket_matches, public.truco_matches, public.truco_standings_overrides, public.truco_history,
    public.truco_team_memberships, public.truco_team_members, public.truco_profiles, public.truco_teams, public.truco_groups,
    public.truco_audit_log, public.truco_championships, public.truco_players, auth.users cascade;
  -- Senhas individuais (03_retrato_oficial.sql): o reset volta todas à senha de ensaio.
  if to_regclass('homologacao.credencial') is not null then execute 'truncate homologacao.credencial'; end if;

  -- Edições: 1 a 4 encerradas, 5 em andamento com o cadeado fechado (padrão da coluna).
  insert into public.truco_championships (truco_id, name, edition, year, status, current_phase, draw_status)
  select homologacao.id('edicao-' || n), n || 'ª Edição', n, 2021 + n,
    (case when n = 5 then 'em_andamento' else 'encerrado' end)::public.truco_championship_status,
    case when n = 5 then 'Fase de Grupos' else 'Campeonato Finalizado' end, 'realizado'
  from generate_series(1, 5) n;

  insert into public.truco_groups (truco_id, truco_championship_id, label, name)
  values (homologacao.id('grupo-a'), homologacao.id('edicao-5'), 'A', 'Grupo Único');

  insert into public.truco_players (truco_id, name)
  select homologacao.id('jogador-' || lpad(n::text, 2, '0')), 'Jogador ' || n from generate_series(1, 16) n;
  insert into public.truco_players (truco_id, name) values (homologacao.id('admin'), 'Administrador');

  -- Identidades fictícias locais. O gatilho real de auditoria de novos usuários dispara aqui,
  -- gravando apenas no truco_audit_log deste banco local.
  insert into auth.users (id, email)
  select homologacao.id('conta-' || lpad(n::text, 2, '0')), 'jogador' || n || '@ensaio.invalid' from generate_series(1, 14) n;
  insert into auth.users (id, email) values (homologacao.id('conta-admin'), 'admin@trucodonovo.com');

  insert into public.truco_profiles (truco_id, truco_player_id, email, role, must_change_password)
  select homologacao.id('conta-' || lpad(n::text, 2, '0')), homologacao.id('jogador-' || lpad(n::text, 2, '0')),
    'jogador' || n || '@ensaio.invalid', 'jogador', false from generate_series(1, 14) n;
  insert into public.truco_profiles (truco_id, truco_player_id, email, role, must_change_password)
  values (homologacao.id('conta-admin'), homologacao.id('admin'), 'admin@trucodonovo.com', 'superadmin', false);

  -- Sete duplas no grupo único: Jogador 1 & 2 (a1) ... Jogador 13 & 14 (a7).
  for v_slot in 1..7 loop
    v_first := (v_slot - 1) * 2 + 1;
    v_team := homologacao.id('dupla-a' || v_slot);
    insert into public.truco_teams (truco_id, truco_championship_id, truco_group_id, name, status, seeded)
    values (v_team, homologacao.id('edicao-5'), homologacao.id('grupo-a'),
      'Jogador ' || v_first || ' & Jogador ' || (v_first + 1), 'aprovada', false);
    insert into public.truco_team_memberships (truco_championship_id, truco_team_id, truco_player_1_id, truco_player_2_id, truco_group_id, strength)
    values (homologacao.id('edicao-5'), v_team, homologacao.id('jogador-' || lpad(v_first::text, 2, '0')),
      homologacao.id('jogador-' || lpad((v_first + 1)::text, 2, '0')), homologacao.id('grupo-a'), 3);
  end loop;

  -- Dupla que só existe no histórico (campeã antiga que não joga esta edição).
  insert into public.truco_teams (truco_id, truco_championship_id, name, status)
  values (homologacao.id('dupla-historica'), homologacao.id('edicao-3'), 'Jogador 15 & Jogador 16', 'pendente');

  -- Só as duplas que já foram campeãs têm par histórico; as outras têm só a participação da edição.
  insert into public.truco_team_members (truco_team_id, truco_player_id, position) values
    (homologacao.id('dupla-a1'), homologacao.id('jogador-01'), 1), (homologacao.id('dupla-a1'), homologacao.id('jogador-02'), 2),
    (homologacao.id('dupla-a2'), homologacao.id('jogador-03'), 1), (homologacao.id('dupla-a2'), homologacao.id('jogador-04'), 2),
    (homologacao.id('dupla-historica'), homologacao.id('jogador-15'), 1), (homologacao.id('dupla-historica'), homologacao.id('jogador-16'), 2);

  for v_edition in 1..4 loop
    insert into public.truco_history (truco_id, truco_championship_id, edition, name, year, champion_team_id, notes)
    values (homologacao.id('historico-' || v_edition), homologacao.id('edicao-' || v_edition), v_edition, v_edition || 'ª Edição', 2021 + v_edition,
      homologacao.id(v_champions[v_edition]), 'Edição fictícia da homologação.');
  end loop;
end $$;

revoke all on function homologacao.reset() from public;
revoke all on function homologacao.id(text) from public;
grant execute on function homologacao.reset() to service_role;
grant execute on function homologacao.id(text) to service_role;
