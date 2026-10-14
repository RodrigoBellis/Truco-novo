-- Troca os participantes de teste pelos OFICIAIS da 5ª edição — formato de 14/10/2026: 7 duplas
-- num grupo único (o grupo "A", mostrado como "Grupo Único").
--
-- ESTADO: validado só na homologação local (backend/scripts/homologacao-participantes.mjs).
-- No Supabase oficial, só com autorização específica do organizador. Rode primeiro como está
-- (v_ensaio = true): mostra o resultado e desfaz tudo.
--
-- Pré-requisito: edition5_reset_competition.sql já gravado (a edição sem jogos).
--
-- O que faz, num único comando (tudo ou nada):
--   * renomeia jogadores pelo id atual (Rafael → Rafinha): mesma pessoa, mesma conta, mesmos dados;
--   * cadastra só os jogadores que ainda não existem (Anderson, Saulo, Digão); nunca duplica:
--     se um nome novo já existir, o comando para;
--   * reaproveita a linha de dupla existente quando o mesmo par continua junto (Ronaldo & Rodrigo);
--   * para par novo, usa uma linha livre da edição — nunca a de uma dupla do Hall da Fama;
--   * uma dupla do Hall da Fama cujo par não joga junto nesta edição (Bagriel & Diguinho) sai da
--     edição (fica "pendente", sem grupo e sem participação) e continua intacta para o histórico;
--   * grava as 7 participações (jogadores, grupo único e força) e os nomes das duplas.
--
-- O que NÃO faz: não apaga jogadores, duplas nem contas; não mexe em truco_team_members (os pares
-- históricos), em truco_history, em senhas nem em e-mails. Contas dos jogadores novos e senhas
-- temporárias são do script de provisionamento (backend/src/scripts/provisionPlayerAccounts.ts).
-- Quem sai da edição continua cadastrado, com conta e títulos; só deixa de aparecer no login.
do $$
declare
  v_ensaio constant boolean := true;  -- true = nada é gravado; false = grava.

  -- [nome atual, nome novo]: mesma pessoa, só o nome muda.
  v_renomear constant jsonb := '[["Rafael", "Rafinha"]]';
  -- Jogadores que ainda não existem e serão cadastrados (Digão é o pai do Diguinho: outra pessoa).
  v_novos constant jsonb := '["Anderson", "Saulo", "Digão"]';
  -- [jogador 1, jogador 2, força (1 a 5)] — nomes como ficam em truco_players depois da renomeação.
  v_oficial constant jsonb := '[
    ["Pigas", "Diguinho", 4],
    ["Ronaldo", "Rodrigo", 5],
    ["JP", "Anderson", 3],
    ["Saulo", "Vitor", 3],
    ["PG", "Alexandre", 2],
    ["Rogério", "Waguinho", 2],
    ["Digão", "Rafinha", 2]
  ]';

  v_edition uuid;
  v_group uuid;
  v_item jsonb;
  v_p1 uuid;
  v_p2 uuid;
  v_team uuid;
  v_count integer;
  v_history_before text;
  v_members_before text;
  v_players_before integer;
  v_profiles_before text;
begin
  select truco_id into strict v_edition from public.truco_championships where edition = 5 and status = 'em_andamento';
  if exists (select 1 from public.truco_matches where truco_championship_id = v_edition) then
    raise exception 'Ainda há jogos na 5ª edição. Rode edition5_reset_competition.sql antes.';
  end if;
  if jsonb_array_length(v_oficial) <> 7 then
    raise exception 'A lista oficial precisa ter 7 duplas; tem %.', jsonb_array_length(v_oficial);
  end if;
  select truco_id into v_group from public.truco_groups where truco_championship_id = v_edition and label = 'A';
  if v_group is null then
    insert into public.truco_groups (truco_championship_id, label, name) values (v_edition, 'A', 'Grupo Único') returning truco_id into v_group;
  end if;

  select string_agg(edition || ':' || coalesce(champion_team_id::text, 'nulo') || ':' || coalesce(runner_up_team_id::text, 'nulo'), ',' order by edition) into v_history_before from public.truco_history;
  select md5(string_agg(truco_team_id::text || truco_player_id::text || position::text, ',' order by truco_team_id, position)) into v_members_before from public.truco_team_members;
  select count(*) into v_players_before from public.truco_players;
  select md5(string_agg(truco_id::text || truco_player_id::text || role::text, ',' order by truco_id)) into v_profiles_before from public.truco_profiles;

  -- 1) Renomear: exatamente um jogador com o nome atual e nenhum com o nome novo.
  for v_item in select * from jsonb_array_elements(v_renomear) loop
    select count(*) into v_count from public.truco_players where name = v_item->>0;
    if v_count <> 1 then raise exception 'Renomear "%": esperado 1 jogador com esse nome, há %.', v_item->>0, v_count; end if;
    if exists (select 1 from public.truco_players where name = v_item->>1) then
      raise exception 'Renomear: já existe um jogador "%"; nada foi gravado.', v_item->>1;
    end if;
    update public.truco_players set name = v_item->>1 where name = v_item->>0;
  end loop;

  -- 2) Cadastrar só quem não existe; nome repetido é recusado para não criar uma segunda identidade.
  for v_item in select * from jsonb_array_elements(v_novos) loop
    if exists (select 1 from public.truco_players where lower(name) = lower(v_item #>> '{}')) then
      raise exception 'O jogador "%" já existe; revise a lista antes de cadastrar outra pessoa com o mesmo nome.', v_item #>> '{}';
    end if;
    insert into public.truco_players (name) values (v_item #>> '{}');
  end loop;

  create temporary table tmp_oficial (ordem int, p1 uuid, p2 uuid, forca int, nome text, team_id uuid) on commit drop;
  for v_item in select * from jsonb_array_elements(v_oficial) loop
    select truco_id into v_p1 from public.truco_players where name = v_item->>0;
    select truco_id into v_p2 from public.truco_players where name = v_item->>1;
    if v_p1 is null or v_p2 is null then
      raise exception 'Jogador não cadastrado: "%" ou "%".', v_item->>0, v_item->>1;
    end if;
    insert into tmp_oficial (ordem, p1, p2, forca, nome)
      values ((select count(*) from tmp_oficial) + 1, v_p1, v_p2, (v_item->>2)::int, (v_item->>0) || ' & ' || (v_item->>1));
  end loop;
  if (select count(distinct p) from (select p1 p from tmp_oficial union all select p2 from tmp_oficial) x) <> 14 then
    raise exception 'A lista oficial precisa ter 14 jogadores diferentes.';
  end if;

  -- 3) Mesmo par que já tem linha de dupla (pelo par histórico ou pela participação atual).
  update tmp_oficial o set team_id = t.truco_id
    from public.truco_teams t
    where t.truco_championship_id = v_edition
      and (
        (select count(*) from public.truco_team_members tm where tm.truco_team_id = t.truco_id and tm.truco_player_id in (o.p1, o.p2)) = 2
        or exists (select 1 from public.truco_team_memberships m where m.truco_team_id = t.truco_id and m.truco_championship_id = v_edition
                   and least(m.truco_player_1_id, m.truco_player_2_id) = least(o.p1, o.p2) and greatest(m.truco_player_1_id, m.truco_player_2_id) = greatest(o.p1, o.p2))
      );

  -- A edição recomeça sem participações e com todas as duplas fora: assim trocar parceiros não
  -- esbarra em "cada jogador em uma só dupla" e o limite do grupo único conta só as oficiais.
  delete from public.truco_team_memberships where truco_championship_id = v_edition;
  update public.truco_teams set status = 'pendente', truco_group_id = null where truco_championship_id = v_edition;

  -- 4) Par novo: reusa uma linha livre que não esteja no Hall da Fama; se não houver, cria.
  for v_item in select to_jsonb(o) from tmp_oficial o where o.team_id is null order by o.ordem loop
    select t.truco_id into v_team from public.truco_teams t
      where t.truco_championship_id = v_edition
        and t.truco_id not in (select team_id from tmp_oficial where team_id is not null)
        and not exists (select 1 from public.truco_history h where t.truco_id in (h.champion_team_id, h.runner_up_team_id))
        and not exists (select 1 from public.truco_team_members tm where tm.truco_team_id = t.truco_id)
      order by t.created_at limit 1;
    if v_team is null then
      insert into public.truco_teams (truco_championship_id, name, status, seeded, is_placeholder)
        values (v_edition, v_item->>'nome', 'pendente', false, false) returning truco_id into v_team;
    end if;
    update tmp_oficial set team_id = v_team where ordem = (v_item->>'ordem')::int;
  end loop;

  -- 5) Grava nome, grupo único, situação e participação das 7 duplas oficiais.
  for v_item in select to_jsonb(o) from tmp_oficial o order by o.ordem loop
    update public.truco_teams set name = v_item->>'nome', truco_group_id = v_group, status = 'aprovada', seeded = false
      where truco_id = (v_item->>'team_id')::uuid;
    insert into public.truco_team_memberships (truco_championship_id, truco_team_id, truco_player_1_id, truco_player_2_id, truco_group_id, strength)
      values (v_edition, (v_item->>'team_id')::uuid, (v_item->>'p1')::uuid, (v_item->>'p2')::uuid, v_group, (v_item->>'forca')::int);
  end loop;

  -- Travas finais.
  if (select count(*) from public.truco_teams where truco_championship_id = v_edition and status = 'aprovada') <> 7
     or (select count(*) from public.truco_team_memberships where truco_championship_id = v_edition) <> 7
     or exists (select 1 from public.truco_teams where truco_championship_id = v_edition and status = 'aprovada' and truco_group_id is distinct from v_group) then
    raise exception 'A edição não ficou com 7 duplas aprovadas no grupo único; nada foi gravado.';
  end if;
  if (select string_agg(edition || ':' || coalesce(champion_team_id::text, 'nulo') || ':' || coalesce(runner_up_team_id::text, 'nulo'), ',' order by edition) from public.truco_history) is distinct from v_history_before
     or (select md5(string_agg(truco_team_id::text || truco_player_id::text || position::text, ',' order by truco_team_id, position)) from public.truco_team_members) is distinct from v_members_before then
    raise exception 'O Hall da Fama ou os pares históricos mudaram; nada foi gravado.';
  end if;
  if (select count(*) from public.truco_players) <> v_players_before + jsonb_array_length(v_novos)
     or (select md5(string_agg(truco_id::text || truco_player_id::text || role::text, ',' order by truco_id)) from public.truco_profiles) is distinct from v_profiles_before then
    raise exception 'Jogadores ou contas mudaram além do previsto; nada foi gravado.';
  end if;

  if v_ensaio then
    raise exception 'ENSAIO (nada foi gravado). Duplas oficiais: %', (
      select string_agg(o.nome || ' [força ' || o.forca || ']', ' | ' order by o.ordem) from tmp_oficial o);
  end if;
  raise notice 'GRAVADO: 7 duplas oficiais no grupo único da 5ª edição. Hall da Fama, pares históricos e contas preservados.';
end $$;
