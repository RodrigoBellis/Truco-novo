-- Retrato da 5ª edição e do Hall da Fama. SOMENTE LEITURA: pode rodar a qualquer momento.
-- Rode antes e depois de qualquer troca de participantes e compare as duas saídas: as linhas
-- "hall" e "campeoes" têm de sair idênticas.
with ed as (select truco_id from public.truco_championships where edition = 5)
select 'edicao 5' as item, (select current_phase || ' / sorteio ' || draw_status || ' / ' || status from public.truco_championships where edition = 5) as valor
union all select 'duplas aprovadas (total)', count(*)::text from public.truco_teams t, ed where t.truco_championship_id = ed.truco_id and t.status = 'aprovada'
union all select 'duplas por grupo', coalesce(string_agg(label || '=' || n, ', ' order by label), '-') from (
  select g.label, count(t.truco_id) n from public.truco_groups g join ed on g.truco_championship_id = ed.truco_id
  left join public.truco_teams t on t.truco_group_id = g.truco_id and t.status = 'aprovada' group by g.label) x
union all select 'participacoes da edicao', count(*)::text from public.truco_team_memberships m, ed where m.truco_championship_id = ed.truco_id
union all select 'jogadores distintos nas participacoes', count(distinct p)::text from (
  select m.truco_player_1_id p from public.truco_team_memberships m, ed where m.truco_championship_id = ed.truco_id
  union select m.truco_player_2_id from public.truco_team_memberships m, ed where m.truco_championship_id = ed.truco_id) x
union all select 'grupo divergente entre dupla e participacao', count(*)::text from public.truco_team_memberships m join public.truco_teams t on t.truco_id = m.truco_team_id, ed
  where m.truco_championship_id = ed.truco_id and m.truco_group_id is distinct from t.truco_group_id
union all select 'jogos por fase/situacao', coalesce(string_agg(s, ', '), 'nenhum') from (
  select m.stage || '/' || m.status || '=' || count(*) s from public.truco_matches m, ed where m.truco_championship_id = ed.truco_id group by m.stage, m.status) x
union all select 'confrontos de mata-mata', count(*)::text from public.truco_bracket_matches b, ed where b.truco_championship_id = ed.truco_id
union all select 'decisoes de empate', count(*)::text from public.truco_standings_overrides o, ed where o.truco_championship_id = ed.truco_id
union all select 'jogadores cadastrados', count(*)::text from public.truco_players
union all select 'contas (perfis)', string_agg(role || '=' || n || ' (precisam trocar senha: ' || mc || ')', ', ') from (
  select role::text, count(*) n, count(*) filter (where must_change_password) mc from public.truco_profiles group by role) x
union all select 'jogadores sem conta', count(*)::text from public.truco_players p where not exists (select 1 from public.truco_profiles f where f.truco_player_id = p.truco_id)
-- Hall da Fama: estas linhas não podem mudar.
union all select 'hall: edicoes', count(*)::text || ' (' || string_agg(edition::text, ',' order by edition) || ')' from public.truco_history
union all select 'hall: edicoes sem campea vinculada', count(*)::text from public.truco_history where champion_team_id is null
union all select 'campeoes', string_agg(h.edition || 'a=' || (
    select string_agg(p.name, ' & ' order by tm.position) from public.truco_team_members tm join public.truco_players p on p.truco_id = tm.truco_player_id where tm.truco_team_id = h.champion_team_id
  ), ' | ' order by h.edition) from public.truco_history h;
