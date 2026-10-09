-- =====================================================================================
-- APLICADO NO BANCO REAL em 09/10/2026, com autorização do dono do projeto para esta operação
-- (ensaio seguido de gravação). Projeto: sfllpogpuqukhjddwiel (compartilhado; o script só
-- toca objetos truco_*). Fica aqui como registro: rodar de novo é recusado pela trava de
-- entrada ("A 3ª edição não aponta mais para a dupla ...").
-- Resultado conferido: 3ª edição = Bitula & Vinícius (dupla histórica ligada à 3ª edição,
-- pendente, sem grupo); 22 jogadores, 11 duplas, 22 integrantes, 21 contas, 10 participações;
-- dupla Bitula & Galão da 5ª edição intacta; Vinícius fora da lista de login.
-- =====================================================================================
--
-- Problema: o Hall da Fama mostra "Bitula & Galão" como campeões da 3ª edição (2024).
-- O dono do projeto informou que a dupla campeã foi "Bitula & Vinícius".
--
-- Causa nos dados (lida em 09/10/2026):
--   truco_history (edition 3, fe89dee0-9ae5-4dab-ac47-6d16d1f856d6)
--     .champion_team_id = 979dd1cd-b3b2-5b1a-8949-30c4647fb98e  ("Bitula & Galão")
--   Essa mesma linha de dupla é a dupla Bitula & Galão que joga a 5ª edição (grupo A).
--   Não existe jogador "Vinícius" em truco_players.
--
-- Modelo da correção: NÃO trocar integrantes da dupla atual. Em vez disso:
--   1. cadastra o jogador Vinícius (só a linha em truco_players; nenhuma conta);
--   2. cria uma dupla histórica "Bitula & Vinícius" ligada à 3ª edição
--      (situação "pendente", sem grupo, sem participação na 5ª edição);
--   3. grava o par histórico dela em truco_team_members (Bitula posição 1, Vinícius 2);
--   4. aponta truco_history.champion_team_id da 3ª edição para a dupla nova e troca a nota.
--
-- O que NÃO faz: não apaga nada; não altera a dupla Bitula & Galão (979dd1cd…), seus
-- integrantes, sua participação, seu grupo, seus jogos ou placares; não toca nas edições
-- 1, 2 e 4, em contas, senhas, perfis nem em objetos de outros aplicativos.
--
-- Um único comando (tudo ou nada). v_ensaio = true executa, confere as travas, devolve o
-- "antes/depois" na mensagem de erro "ENSAIO" e desfaz tudo.
--
-- CONFIRMADO PELO DONO EM 09/10/2026:
--   a) o campeão é "Vinícius", um jogador novo — não é o Vito nem o Vitor já cadastrados;
--   b) é a MESMA pessoa que vai jogar a 5ª edição. O cadastro criado aqui é o único dele:
--      edition5_replace_participants.sql resolve jogadores pelo nome exato, então a lista
--      oficial deve trazer "Vinícius" com esta grafia para reaproveitar esta linha em vez
--      de criar outra. Enquanto ele não tiver dupla na 5ª edição, não aparece nas cartas de
--      login nem recebe conta (backend/src/services/loginRoster.ts).
-- AINDA A CONFIRMAR: o texto novo da nota da 3ª edição (v_nota_nova).
--
-- VERIFICADO NO CATÁLOGO REAL (somente leitura, 09/10/2026): truco_team_members só tem
-- unique(truco_team_id, truco_player_id) e unique(truco_team_id, position); não há unicidade
-- por jogador, então Bitula pode ter a dupla atual e a histórica. O gatilho de capacidade de
-- truco_teams só age em duplas aprovadas da 5ª edição; a dupla histórica é da 3ª e pendente.
-- O gatilho de auditoria registra a criação da dupla em truco_audit_log (1 linha).
--
-- VALIDADO EM CÓPIA ISOLADA (Postgres 17 local descartável, com a estrutura, as restrições,
-- os gatilhos e as linhas truco_* lidos do banco real; jogos e contas vazios na cópia):
-- ensaio devolveu o ANTES/DEPOIS e não gravou nada; a gravação deixou 3a = Bitula & Vinícius,
-- +1 jogador, +1 dupla, +2 integrantes; a segunda execução foi recusada pela trava de entrada.
-- A cópia não reproduz RLS nem permissões do Supabase: rodar como o papel do SQL Editor.

do $$
declare
  v_ensaio constant boolean := true;  -- true = nada é gravado; false = grava.

  v_nome_vinicius      constant text := 'Vinícius';
  v_vinicius_existente constant uuid := null;  -- preencher só se ele já existir com outro nome
  v_nota_nova          constant text := 'Bitula e Vinícius quebraram a sequência e levantaram o troféu pela primeira vez.';

  -- Identificadores lidos do banco em 09/10/2026. As travas abaixo conferem todos.
  c_history_ed3   constant uuid := 'fe89dee0-9ae5-4dab-ac47-6d16d1f856d6';
  c_team_errada   constant uuid := '979dd1cd-b3b2-5b1a-8949-30c4647fb98e';  -- Bitula & Galão (5ª edição)
  c_bitula        constant uuid := '68d0b615-477f-594c-a26c-9e652d4fc181';
  c_galao         constant uuid := '13f0e552-19e0-5f01-9238-176549e69d8c';

  v_ed3 uuid;
  v_ed5 uuid;
  v_vinicius uuid;
  v_team_nova uuid;
  v_antes text;
  v_depois text;
  v_outras_edicoes text;
  v_members_md5 text;
  v_teams_ed5_md5 text;
  v_memberships_md5 text;
  v_matches_md5 text;
  v_n_players int;
  v_n_teams int;
  v_n_members int;
  v_n_profiles int;
begin
  -- ---------- Travas de entrada ----------
  select truco_id into strict v_ed3 from public.truco_championships where edition = 3;
  select truco_id into strict v_ed5 from public.truco_championships where edition = 5;

  if (select count(*) from public.truco_history) <> 4 then
    raise exception 'O Hall da Fama não tem 4 edições; estado diferente do diagnosticado. Nada foi gravado.';
  end if;
  if not exists (select 1 from public.truco_history
                 where truco_id = c_history_ed3 and edition = 3 and truco_championship_id = v_ed3
                   and champion_team_id = c_team_errada) then
    raise exception 'A 3ª edição não aponta mais para a dupla % (já corrigida ou alterada). Nada foi gravado.', c_team_errada;
  end if;
  if (select string_agg(tm.truco_player_id::text, ',' order by tm.position)
        from public.truco_team_members tm where tm.truco_team_id = c_team_errada)
     is distinct from c_bitula::text || ',' || c_galao::text then
    raise exception 'A dupla % não é mais Bitula (1) & Galão (2). Nada foi gravado.', c_team_errada;
  end if;
  if (select name from public.truco_players where truco_id = c_bitula) is distinct from 'Bitula' then
    raise exception 'O jogador % não se chama mais Bitula. Nada foi gravado.', c_bitula;
  end if;

  -- ---------- Retrato antes ----------
  select string_agg(h.edition || 'a=' || coalesce((
      select string_agg(p.name, ' & ' order by tm.position) from public.truco_team_members tm
        join public.truco_players p on p.truco_id = tm.truco_player_id where tm.truco_team_id = h.champion_team_id), 'nulo'),
    ' | ' order by h.edition) into v_antes from public.truco_history h;

  select string_agg(edition || ':' || coalesce(champion_team_id::text, 'nulo') || ':' || coalesce(runner_up_team_id::text, 'nulo')
                    || ':' || coalesce(final_result, 'nulo') || ':' || md5(notes), ',' order by edition)
    into v_outras_edicoes from public.truco_history where edition <> 3;
  select md5(string_agg(truco_id::text || truco_team_id::text || truco_player_id::text || position::text, ',' order by truco_id))
    into v_members_md5 from public.truco_team_members;
  select md5(string_agg(truco_id::text || name || status::text || coalesce(truco_group_id::text, 'nulo') || seeded::text || is_placeholder::text, ',' order by truco_id))
    into v_teams_ed5_md5 from public.truco_teams where truco_championship_id = v_ed5;
  select md5(string_agg(truco_id::text || truco_team_id::text || truco_player_1_id::text || truco_player_2_id::text
                        || coalesce(truco_group_id::text, 'nulo') || strength::text, ',' order by truco_id))
    into v_memberships_md5 from public.truco_team_memberships;
  select md5(coalesce(string_agg(truco_id::text || truco_team_a_id::text || truco_team_b_id::text || status::text
                        || coalesce(sets_a::text, 'n') || coalesce(sets_b::text, 'n'), ',' order by truco_id), ''))
    into v_matches_md5 from public.truco_matches;
  select count(*) into v_n_players from public.truco_players;
  select count(*) into v_n_teams from public.truco_teams;
  select count(*) into v_n_members from public.truco_team_members;
  select count(*) into v_n_profiles from public.truco_profiles;

  -- ---------- 1) Jogador Vinícius ----------
  if v_vinicius_existente is not null then
    select truco_id into v_vinicius from public.truco_players where truco_id = v_vinicius_existente;
    if v_vinicius is null then raise exception 'v_vinicius_existente não existe em truco_players. Nada foi gravado.'; end if;
    if v_vinicius in (c_bitula, c_galao) then raise exception 'v_vinicius_existente não pode ser Bitula nem Galão. Nada foi gravado.'; end if;
  else
    if exists (select 1 from public.truco_players
               where lower(translate(name, 'íÍ', 'iI')) in ('vinicius', 'vini')
                  or lower(translate(coalesce(nickname, ''), 'íÍ', 'iI')) in ('vinicius', 'vini')) then
      raise exception 'Já existe um jogador Vinícius/Vini. Informe o id em v_vinicius_existente. Nada foi gravado.';
    end if;
    insert into public.truco_players (name) values (v_nome_vinicius) returning truco_id into v_vinicius;
  end if;

  -- Não pode já existir uma dupla com este par.
  if exists (select 1 from public.truco_team_members a join public.truco_team_members b on b.truco_team_id = a.truco_team_id
             where a.truco_player_id = c_bitula and b.truco_player_id = v_vinicius) then
    raise exception 'Já existe uma dupla Bitula + Vinícius em truco_team_members. Nada foi gravado.';
  end if;

  -- ---------- 2) Dupla histórica, ligada à 3ª edição (fora da 5ª: sem grupo, sem participação) ----------
  insert into public.truco_teams (truco_championship_id, name, status, seeded, is_placeholder, truco_group_id)
    values (v_ed3, 'Bitula & ' || (select name from public.truco_players where truco_id = v_vinicius), 'pendente', false, false, null)
    returning truco_id into v_team_nova;

  -- ---------- 3) Par histórico ----------
  insert into public.truco_team_members (truco_team_id, truco_player_id, position)
    values (v_team_nova, c_bitula, 1), (v_team_nova, v_vinicius, 2);

  -- ---------- 4) Hall da Fama: só a linha da 3ª edição ----------
  update public.truco_history
     set champion_team_id = v_team_nova, notes = v_nota_nova
   where truco_id = c_history_ed3 and edition = 3 and champion_team_id = c_team_errada;
  if not found then raise exception 'A linha da 3ª edição não foi atualizada. Nada foi gravado.'; end if;

  -- ---------- Travas finais ----------
  if (select count(*) from public.truco_history) <> 4
     or exists (select 1 from public.truco_history where champion_team_id is null) then
    raise exception 'O Hall da Fama ficou sem 4 edições com campeã. Nada foi gravado.';
  end if;
  if (select string_agg(edition || ':' || coalesce(champion_team_id::text, 'nulo') || ':' || coalesce(runner_up_team_id::text, 'nulo')
                        || ':' || coalesce(final_result, 'nulo') || ':' || md5(notes), ',' order by edition)
        from public.truco_history where edition <> 3) is distinct from v_outras_edicoes then
    raise exception 'As edições 1, 2 ou 4 mudaram. Nada foi gravado.';
  end if;
  if (select md5(string_agg(truco_id::text || truco_team_id::text || truco_player_id::text || position::text, ',' order by truco_id))
        from public.truco_team_members where truco_team_id <> v_team_nova) is distinct from v_members_md5 then
    raise exception 'Os pares históricos já existentes mudaram. Nada foi gravado.';
  end if;
  if (select md5(string_agg(truco_id::text || name || status::text || coalesce(truco_group_id::text, 'nulo') || seeded::text || is_placeholder::text, ',' order by truco_id))
        from public.truco_teams where truco_championship_id = v_ed5) is distinct from v_teams_ed5_md5 then
    raise exception 'As duplas da 5ª edição mudaram. Nada foi gravado.';
  end if;
  if (select md5(string_agg(truco_id::text || truco_team_id::text || truco_player_1_id::text || truco_player_2_id::text
                            || coalesce(truco_group_id::text, 'nulo') || strength::text, ',' order by truco_id))
        from public.truco_team_memberships) is distinct from v_memberships_md5 then
    raise exception 'As participações mudaram. Nada foi gravado.';
  end if;
  if (select md5(coalesce(string_agg(truco_id::text || truco_team_a_id::text || truco_team_b_id::text || status::text
                            || coalesce(sets_a::text, 'n') || coalesce(sets_b::text, 'n'), ',' order by truco_id), ''))
        from public.truco_matches) is distinct from v_matches_md5 then
    raise exception 'Os jogos mudaram. Nada foi gravado.';
  end if;
  if (select count(*) from public.truco_teams) <> v_n_teams + 1
     or (select count(*) from public.truco_team_members) <> v_n_members + 2
     or (select count(*) from public.truco_players) <> v_n_players + (case when v_vinicius_existente is null then 1 else 0 end)
     or (select count(*) from public.truco_profiles) <> v_n_profiles then
    raise exception 'Contagens inesperadas de duplas, integrantes, jogadores ou contas. Nada foi gravado.';
  end if;
  if (select string_agg(p.name, ' & ' order by tm.position) from public.truco_team_members tm
        join public.truco_players p on p.truco_id = tm.truco_player_id
       where tm.truco_team_id = (select champion_team_id from public.truco_history where edition = 3))
     is distinct from 'Bitula & ' || (select name from public.truco_players where truco_id = v_vinicius) then
    raise exception 'A campeã da 3ª edição não ficou Bitula & Vinícius. Nada foi gravado.';
  end if;

  -- ---------- Retrato depois ----------
  select string_agg(h.edition || 'a=' || coalesce((
      select string_agg(p.name, ' & ' order by tm.position) from public.truco_team_members tm
        join public.truco_players p on p.truco_id = tm.truco_player_id where tm.truco_team_id = h.champion_team_id), 'nulo'),
    ' | ' order by h.edition) into v_depois from public.truco_history h;

  if v_ensaio then
    raise exception 'ENSAIO (nada foi gravado). ANTES: % || DEPOIS: % || dupla nova % (3ª edição, pendente), jogador Vinícius %',
      v_antes, v_depois, v_team_nova, v_vinicius;
  end if;
  raise notice 'GRAVADO. ANTES: % || DEPOIS: % || dupla nova %, jogador Vinícius %', v_antes, v_depois, v_team_nova, v_vinicius;
end $$;

-- =====================================================================================
-- CONFERÊNCIAS — SOMENTE LEITURA. Rodar separadamente, antes e depois.
-- =====================================================================================
--
-- (A) Hall da Fama com integrantes. Antes: 3a = Bitula & Galão. Depois: 3a = Bitula & Vinícius.
--     As linhas 1, 2 e 4 têm de sair idênticas.
-- select h.edition, h.name, h.year, h.champion_team_id, t.name as dupla, c.edition as edicao_da_dupla, t.status,
--        (select string_agg(p.name, ' & ' order by tm.position) from public.truco_team_members tm
--           join public.truco_players p on p.truco_id = tm.truco_player_id where tm.truco_team_id = t.truco_id) as integrantes,
--        h.runner_up_team_id, h.final_result, h.notes
--   from public.truco_history h
--   left join public.truco_teams t on t.truco_id = h.champion_team_id
--   left join public.truco_championships c on c.truco_id = t.truco_championship_id
--  order by h.edition;
--
-- (B) A dupla Bitula & Galão da 5ª edição tem de continuar igual (aprovada, grupo A, participação).
-- select t.truco_id, t.name, t.status, g.label as grupo,
--        (select string_agg(p.name, ' & ' order by tm.position) from public.truco_team_members tm
--           join public.truco_players p on p.truco_id = tm.truco_player_id where tm.truco_team_id = t.truco_id) as par_historico,
--        (select p1.name || ' & ' || p2.name from public.truco_team_memberships m
--           join public.truco_players p1 on p1.truco_id = m.truco_player_1_id
--           join public.truco_players p2 on p2.truco_id = m.truco_player_2_id where m.truco_team_id = t.truco_id) as participacao_5a
--   from public.truco_teams t left join public.truco_groups g on g.truco_id = t.truco_group_id
--  where t.truco_id = '979dd1cd-b3b2-5b1a-8949-30c4647fb98e';
--
-- (C) supabase/scripts/edition5_precheck.sql inteiro. Depois da correção mudam, e só estas:
--     "jogadores cadastrados" 21 -> 22, "jogadores sem conta" 0 -> 1 e a linha "campeoes"
--     (3a=Bitula & Galão -> 3a=Bitula & Vinícius). O retrato novo vira a referência do lançamento.
--
-- (D) Restrições e gatilhos (catálogo). Já lidos em 09/10/2026; repetir se quiser reconferir:
-- select conrelid::regclass as tabela, conname, contype, pg_get_constraintdef(oid) as definicao
--   from pg_constraint
--  where conrelid in ('public.truco_team_members'::regclass, 'public.truco_teams'::regclass,
--                     'public.truco_players'::regclass, 'public.truco_history'::regclass)
--  order by 1, 2;
-- select tablename, indexname, indexdef from pg_indexes
--  where schemaname = 'public' and tablename in ('truco_team_members', 'truco_teams', 'truco_players', 'truco_history');
-- select event_object_table, trigger_name, action_timing, event_manipulation from information_schema.triggers
--  where event_object_schema = 'public'
--    and event_object_table in ('truco_team_members', 'truco_teams', 'truco_players', 'truco_history');
