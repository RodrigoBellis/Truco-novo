-- MODELO para trocar os participantes de teste pelos oficiais da 5ª edição (10 duplas, 5 por
-- grupo). NÃO rode este arquivo como está: a lista "oficial" abaixo é preenchida com os nomes
-- que o organizador enviar. Pré-requisito: edition5_reset_competition.sql já gravado (sem jogos).
--
-- O que faz, num único comando (tudo ou nada):
--   * reaproveita a linha de dupla existente quando o mesmo par continua junto;
--   * para par novo, usa uma linha livre da edição — nunca a de uma dupla do Hall da Fama;
--   * uma dupla do Hall da Fama cujo par não joga junto nesta edição sai da edição (fica
--     "pendente", sem grupo e sem participação) e continua intacta para o histórico;
--   * regrava as 10 participações (jogadores, grupo e força) e os nomes das duplas.
--
-- O que NÃO faz: não apaga duplas, não mexe em truco_team_members (os pares históricos), em
-- truco_history, em contas nem em senhas. Jogador que ainda não existe em truco_players faz o
-- comando parar com erro: cadastre-o antes na tela Jogadores e rode o provisionamento de contas.
do $$
declare
  v_ensaio constant boolean := true;  -- true = nada é gravado; false = grava.

  -- PREENCHER: [jogador 1, jogador 2, grupo, força (1 a 5)] — nomes exatamente como em truco_players.
  v_oficial constant jsonb := '[
    ["JOGADOR 1", "JOGADOR 2", "A", 3]
  ]';

  v_edition uuid;
  v_item jsonb;
  v_p1 uuid;
  v_p2 uuid;
  v_group uuid;
  v_team uuid;
  v_history_before text;
  v_members_before text;
begin
  select truco_id into strict v_edition from public.truco_championships where edition = 5 and status = 'em_andamento';
  if exists (select 1 from public.truco_matches where truco_championship_id = v_edition) then
    raise exception 'Ainda há jogos na 5ª edição. Rode edition5_reset_competition.sql antes.';
  end if;
  if jsonb_array_length(v_oficial) <> 10 then
    raise exception 'A lista oficial precisa ter 10 duplas; tem %.', jsonb_array_length(v_oficial);
  end if;

  select string_agg(edition || ':' || coalesce(champion_team_id::text, 'nulo') || ':' || coalesce(runner_up_team_id::text, 'nulo'), ',' order by edition) into v_history_before from public.truco_history;
  select md5(string_agg(truco_team_id::text || truco_player_id::text || position::text, ',' order by truco_team_id, position)) into v_members_before from public.truco_team_members;

  create temporary table tmp_oficial (ordem int, p1 uuid, p2 uuid, grupo uuid, forca int, nome text, team_id uuid) on commit drop;

  for v_item in select * from jsonb_array_elements(v_oficial) loop
    select truco_id into v_p1 from public.truco_players where name = v_item->>0;
    select truco_id into v_p2 from public.truco_players where name = v_item->>1;
    if v_p1 is null or v_p2 is null then
      raise exception 'Jogador não cadastrado: "%" ou "%". Cadastre antes na tela Jogadores.', v_item->>0, v_item->>1;
    end if;
    select truco_id into v_group from public.truco_groups where truco_championship_id = v_edition and label = v_item->>2;
    if v_group is null then raise exception 'Grupo inválido: %', v_item->>2; end if;
    insert into tmp_oficial (ordem, p1, p2, grupo, forca, nome)
      values ((select count(*) from tmp_oficial) + 1, v_p1, v_p2, v_group, (v_item->>3)::int, (v_item->>0) || ' & ' || (v_item->>1));
  end loop;

  if (select count(distinct p) from (select p1 p from tmp_oficial union all select p2 from tmp_oficial) x) <> 20 then
    raise exception 'A lista oficial precisa ter 20 jogadores diferentes.';
  end if;
  if exists (select 1 from tmp_oficial group by grupo having count(*) <> 5) then
    raise exception 'Cada grupo precisa ter exatamente 5 duplas.';
  end if;

  -- 1) Mesmo par que já tem linha de dupla (pelo par histórico ou pela participação atual).
  update tmp_oficial o set team_id = t.truco_id
    from public.truco_teams t
    where t.truco_championship_id = v_edition
      and (
        (select count(*) from public.truco_team_members tm where tm.truco_team_id = t.truco_id and tm.truco_player_id in (o.p1, o.p2)) = 2
        or exists (select 1 from public.truco_team_memberships m where m.truco_team_id = t.truco_id and m.truco_championship_id = v_edition
                   and least(m.truco_player_1_id, m.truco_player_2_id) = least(o.p1, o.p2) and greatest(m.truco_player_1_id, m.truco_player_2_id) = greatest(o.p1, o.p2))
      );

  -- A edição recomeça sem participações: assim trocar parceiros entre duplas não esbarra na
  -- regra "cada jogador em uma só dupla" no meio do caminho.
  delete from public.truco_team_memberships where truco_championship_id = v_edition;

  -- 2) Duplas da edição que não ficaram com nenhum par oficial saem da edição. As do Hall da
  --    Fama permanecem só como registro histórico; as demais ficam livres para reuso.
  update public.truco_teams set status = 'pendente', truco_group_id = null
    where truco_championship_id = v_edition and truco_id not in (select team_id from tmp_oficial where team_id is not null);

  -- 3) Par novo: reusa uma linha livre que não esteja no Hall da Fama; se não houver, cria.
  for v_item in select to_jsonb(o) from tmp_oficial o where o.team_id is null order by o.ordem loop
    select t.truco_id into v_team from public.truco_teams t
      where t.truco_championship_id = v_edition and t.status = 'pendente'
        and t.truco_id not in (select team_id from tmp_oficial where team_id is not null)
        and not exists (select 1 from public.truco_history h where t.truco_id in (h.champion_team_id, h.runner_up_team_id))
      order by t.created_at limit 1;
    if v_team is null then
      insert into public.truco_teams (truco_championship_id, name, status, seeded, is_placeholder)
        values (v_edition, v_item->>'nome', 'pendente', false, false) returning truco_id into v_team;
    end if;
    update tmp_oficial set team_id = v_team where ordem = (v_item->>'ordem')::int;
  end loop;

  -- 4) Grava nome, grupo, situação e participação das 10 duplas oficiais.
  for v_item in select to_jsonb(o) from tmp_oficial o order by o.ordem loop
    update public.truco_teams set name = v_item->>'nome', truco_group_id = (v_item->>'grupo')::uuid, status = 'aprovada'
      where truco_id = (v_item->>'team_id')::uuid;
    insert into public.truco_team_memberships (truco_championship_id, truco_team_id, truco_player_1_id, truco_player_2_id, truco_group_id, strength)
      values (v_edition, (v_item->>'team_id')::uuid, (v_item->>'p1')::uuid, (v_item->>'p2')::uuid, (v_item->>'grupo')::uuid, (v_item->>'forca')::int);
  end loop;

  -- Travas finais.
  if (select count(*) from public.truco_teams where truco_championship_id = v_edition and status = 'aprovada') <> 10
     or (select count(*) from public.truco_team_memberships where truco_championship_id = v_edition) <> 10 then
    raise exception 'A edição não ficou com 10 duplas aprovadas e 10 participações; nada foi gravado.';
  end if;
  if (select string_agg(edition || ':' || coalesce(champion_team_id::text, 'nulo') || ':' || coalesce(runner_up_team_id::text, 'nulo'), ',' order by edition) from public.truco_history) is distinct from v_history_before
     or (select md5(string_agg(truco_team_id::text || truco_player_id::text || position::text, ',' order by truco_team_id, position)) from public.truco_team_members) is distinct from v_members_before then
    raise exception 'O Hall da Fama ou os pares históricos mudaram; nada foi gravado.';
  end if;

  if v_ensaio then
    raise exception 'ENSAIO (nada foi gravado). Duplas oficiais: %', (
      select string_agg(o.nome || ' [' || g.label || ', força ' || o.forca || ']', ' | ' order by g.label, o.ordem) from tmp_oficial o join public.truco_groups g on g.truco_id = o.grupo);
  end if;
  raise notice 'GRAVADO: 10 duplas oficiais na 5ª edição. Hall da Fama e pares históricos preservados.';
end $$;
