-- NÃO APLICADA. Preparada para homologação; nunca executar o ensaio em produção.
-- Requer 202610090001_knockout_uniqueness.sql e results_locked.
-- CLI ausente: arquivo criado localmente sem instalar ferramentas.
-- Verificar projeto, histórico de migrações, FKs, enums e schema em homologação antes de aplicar.
begin;

alter table public.truco_championships add column if not exists progression_revision bigint not null default 0;
alter table public.truco_championships add column if not exists progression_pending boolean not null default false;

create or replace function public.truco_fn_edition_transition_lock() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('truco:active-edition',0));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists truco_active_edition_lock on public.truco_championships;
create trigger truco_active_edition_lock before insert or update or delete on public.truco_championships
for each row execute function public.truco_fn_edition_transition_lock();

-- Todas as fontes de decisões invalidam planos anteriores, inclusive edições/cadeado/perfis.
create or replace function public.truco_fn_championship_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if to_jsonb(new) - 'progression_revision' - 'updated_at'
     is distinct from to_jsonb(old) - 'progression_revision' - 'updated_at' then
    new.progression_revision := old.progression_revision + 1;
  end if;
  return new;
end $$;
drop trigger if exists truco_championship_revision on public.truco_championships;
create trigger truco_championship_revision before update on public.truco_championships
for each row execute function public.truco_fn_championship_revision();

create or replace function public.truco_fn_invalidate_progression() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_old uuid; v_new uuid;
begin
  if tg_table_name in ('truco_profiles','truco_history','truco_team_members') then
    update public.truco_championships set progression_revision = progression_revision + 1 where status = 'em_andamento';
  else
    if tg_op <> 'INSERT' then v_old := (to_jsonb(old)->>'truco_championship_id')::uuid; end if;
    if tg_op <> 'DELETE' then v_new := (to_jsonb(new)->>'truco_championship_id')::uuid; end if;
    update public.truco_championships set progression_revision = progression_revision + 1
      where truco_id = v_old or truco_id = v_new;
  end if;
  return null;
end $$;
do $$ declare v_table text; begin
  foreach v_table in array array['truco_matches','truco_bracket_matches','truco_team_memberships','truco_teams','truco_groups','truco_standings_overrides','truco_profiles','truco_history','truco_team_members'] loop
    execute format('drop trigger if exists truco_invalidate_progression on public.%I', v_table);
    execute format('create trigger truco_invalidate_progression after insert or update or delete on public.%I for each row execute function public.truco_fn_invalidate_progression()', v_table);
  end loop;
end $$;

create or replace function public.truco_rpc_record_match_result_v2(
  p_championship_id uuid, p_match_id uuid, p_sets_a integer, p_sets_b integer,
  p_actor_id uuid, p_expected_revision bigint
) returns void language plpgsql security invoker set search_path = '' as $$
declare c public.truco_championships%rowtype; m public.truco_matches%rowtype;
  a public.truco_profiles%rowtype; v_old_winner uuid; v_new_winner uuid;
begin
  -- Mesma linha bloqueada por avanço, cadeado e alterações da edição.
  perform pg_advisory_xact_lock(hashtextextended('truco:active-edition',0));
  select * into c from public.truco_championships where truco_id = p_championship_id for update;
  if not found or c.truco_id is distinct from (
    select truco_id from public.truco_championships where status = 'em_andamento' order by edition desc limit 1
  ) then raise exception using errcode = '42501', message = 'A edição atual mudou'; end if;
  if p_expected_revision is null or c.progression_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Estado do campeonato mudou';
  end if;
  select * into a from public.truco_profiles where truco_id = p_actor_id for share;
  if not found or a.must_change_password then raise exception using errcode = '42501', message = 'Perfil sem permissão'; end if;
  select * into m from public.truco_matches where truco_id = p_match_id and truco_championship_id = c.truco_id for update;
  if not found then raise exception using errcode = '42501', message = 'Partida fora da edição'; end if;
  if a.role not in ('admin','superadmin') then
    if a.role <> 'jogador' or c.results_locked or c.current_phase = 'Campeonato Finalizado' then
      raise exception using errcode = '42501', message = 'Resultados bloqueados';
    end if;
    if not exists (select 1 from public.truco_team_memberships
      where truco_championship_id = c.truco_id and truco_team_id in (m.truco_team_a_id,m.truco_team_b_id)
      and a.truco_player_id in (truco_player_1_id,truco_player_2_id)) then
      raise exception using errcode = '42501', message = 'Jogador fora da partida';
    end if;
  end if;
  if p_sets_a is null or p_sets_b is null or (p_sets_a,p_sets_b) not in ((2,0),(2,1),(1,2),(0,2)) then
    raise exception using errcode = '22023', message = 'Placar inválido';
  end if;
  if m.stage = 'mata-mata' and m.sets_a is null and c.progression_pending then
    raise exception using errcode='40001',message='Avanço anterior pendente; aguarde a reconciliação';
  end if;
  if m.stage = 'grupos' and exists (select 1 from public.truco_matches
    where truco_championship_id = c.truco_id and stage = 'mata-mata' and sets_a is not null) then
    raise exception using errcode = '40001', message = 'Mata-mata já disputado';
  end if;
  v_new_winner := case when p_sets_a > p_sets_b then m.truco_team_a_id else m.truco_team_b_id end;
  v_old_winner := case when m.sets_a > m.sets_b then m.truco_team_a_id else m.truco_team_b_id end;
  if m.stage = 'mata-mata' and m.sets_a is not null and v_old_winner <> v_new_winner then
    if exists (
      with recursive downstream as (
        select b.truco_id from public.truco_bracket_matches b where b.truco_championship_id = c.truco_id and b.truco_match_id = m.truco_id
        union
        select b.truco_id from public.truco_bracket_matches b join downstream d
          on b.slot_a_source_id = d.truco_id or b.slot_b_source_id = d.truco_id
          where b.truco_championship_id = c.truco_id
      ) select 1 from downstream d join public.truco_bracket_matches b on b.truco_id = d.truco_id
        join public.truco_matches next_match on next_match.truco_id = b.truco_match_id
        where next_match.truco_id <> m.truco_id and next_match.sets_a is not null
    ) or (m.round = 'Repescagem' and exists (select 1 from public.truco_matches
      where truco_championship_id = c.truco_id and round = 'Quartas de final' and sets_a is not null)) then
      raise exception using errcode = '40001', message = 'Fase seguinte já disputada';
    end if;
  end if;
  -- Repetição idêntica é idempotente também na auditoria.
  if m.sets_a = p_sets_a and m.sets_b = p_sets_b then return; end if;
  update public.truco_matches set sets_a = p_sets_a, sets_b = p_sets_b, status = 'realizado', updated_at = now() where truco_id = m.truco_id;
  update public.truco_championships set progression_pending=true where truco_id=c.truco_id;
  insert into public.truco_audit_log (truco_championship_id,entity,entity_id,action,truco_actor_id,metadata)
  values(c.truco_id,'match_result',m.truco_id,case when m.sets_a is null then 'result_created' else 'result_updated' end,p_actor_id,
    jsonb_build_object('previous',case when m.sets_a is null then null else jsonb_build_object('setsA',m.sets_a,'setsB',m.sets_b) end,
      'next',jsonb_build_object('setsA',p_sets_a,'setsB',p_sets_b)));
end $$;

-- Um plano de shared/src/progression.ts por transação: nenhum passo parcial é publicado.
create or replace function public.truco_rpc_apply_knockout_plan(
  p_championship_id uuid, p_expected_revision bigint, p_steps jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare c public.truco_championships%rowtype; s jsonb; v_match uuid; v_rows integer;
  f public.truco_matches%rowtype; v_champion uuid; v_runner uuid; v_team uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('truco:active-edition',0));
  select * into c from public.truco_championships where truco_id = p_championship_id for update;
  if not found or c.truco_id is distinct from (select truco_id from public.truco_championships where status = 'em_andamento' order by edition desc limit 1) then
    raise exception using errcode = '42501', message = 'Edição mudou';
  end if;
  if p_expected_revision is null or p_expected_revision <> c.progression_revision then
    raise exception using errcode = '40001', message = 'Plano desatualizado';
  end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) > 32 then
    raise exception using errcode = '22023', message = 'Plano inválido';
  end if;
  for s in select value from jsonb_array_elements(p_steps) loop
    case s->>'type'
    when 'clear-knockout' then
      if exists(select 1 from public.truco_matches where truco_championship_id = c.truco_id and stage = 'mata-mata' and sets_a is not null) then
        raise exception using errcode = '40001', message = 'Mata-mata tem resultados';
      end if;
      delete from public.truco_bracket_matches where truco_championship_id = c.truco_id;
      delete from public.truco_matches where truco_championship_id = c.truco_id and stage = 'mata-mata' and status = 'pendente';
    when 'create-bracket' then
      insert into public.truco_bracket_matches(truco_id,truco_championship_id,round,label,match_order,
        slot_a_type,slot_a_team_id,slot_a_source_id,slot_b_type,slot_b_team_id,slot_b_source_id)
      select (r->>'id')::uuid,c.truco_id,
        (case r->>'round' when 'repescagem' then 'oitavas' else r->>'round' end)::public.truco_bracket_round,
        r->>'label',(r->>'order')::integer,
        (r->'slotA'->>'type')::public.truco_bracket_slot_type,(r->'slotA'->>'teamId')::uuid,(r->'slotA'->>'bracketMatchId')::uuid,
        (r->'slotB'->>'type')::public.truco_bracket_slot_type,(r->'slotB'->>'teamId')::uuid,(r->'slotB'->>'bracketMatchId')::uuid
        from jsonb_array_elements(s->'rows') r;
    when 'create-match' then
      insert into public.truco_matches(truco_championship_id,stage,round,match_order,truco_team_a_id,truco_team_b_id,status)
      values(c.truco_id,'mata-mata',s->>'round',(s->>'order')::integer,(s->>'teamAId')::uuid,(s->>'teamBId')::uuid,'pendente') returning truco_id into v_match;
      update public.truco_bracket_matches set truco_match_id = v_match where truco_id = (s->>'bracketMatchId')::uuid and truco_championship_id = c.truco_id;
      if not found then raise exception 'Confronto ausente'; end if;
    when 'link-match' then
      if not exists(select 1 from public.truco_matches where truco_id = (s->>'matchId')::uuid and truco_championship_id = c.truco_id and stage = 'mata-mata') then raise exception 'Jogo fora da edição'; end if;
      update public.truco_bracket_matches set truco_match_id = (s->>'matchId')::uuid where truco_id = (s->>'bracketMatchId')::uuid and truco_championship_id = c.truco_id;
      if not found then raise exception 'Confronto ausente'; end if;
    when 'set-quarter-source' then
      if not exists(select 1 from public.truco_bracket_matches where truco_id = (s->>'sourceBracketMatchId')::uuid and truco_championship_id = c.truco_id) then raise exception 'Origem fora da edição'; end if;
      update public.truco_bracket_matches set slot_b_type = 'winner',slot_b_team_id = null,slot_b_source_id = (s->>'sourceBracketMatchId')::uuid
        where truco_id = (s->>'bracketMatchId')::uuid and truco_championship_id = c.truco_id;
      if not found then raise exception 'Confronto ausente'; end if;
    when 'delete-match' then
      delete from public.truco_matches where truco_id = (s->>'matchId')::uuid and truco_championship_id = c.truco_id and stage = 'mata-mata' and status = 'pendente';
      if not found then raise exception using errcode = '40001',message = 'Jogo mudou'; end if;
    when 'set-match-team' then
      update public.truco_matches set
        truco_team_a_id = case when s->>'side' = 'A' then (s->>'teamId')::uuid else truco_team_a_id end,
        truco_team_b_id = case when s->>'side' = 'B' then (s->>'teamId')::uuid else truco_team_b_id end
        where truco_id = (s->>'matchId')::uuid and truco_championship_id = c.truco_id and stage = 'mata-mata' and status = 'pendente';
      if not found then raise exception using errcode = '40001',message = 'Jogo mudou'; end if;
    when 'record-champion' then
      select m.* into strict f from public.truco_bracket_matches b join public.truco_matches m on m.truco_id = b.truco_match_id
        where b.truco_championship_id = c.truco_id and b.round = 'final' and m.sets_a is not null;
      v_champion := case when f.sets_a > f.sets_b then f.truco_team_a_id else f.truco_team_b_id end;
      v_runner := case when v_champion = f.truco_team_a_id then f.truco_team_b_id else f.truco_team_a_id end;
      if v_champion is distinct from (s->>'championTeamId')::uuid or v_runner is distinct from (s->>'runnerUpTeamId')::uuid
        or s->>'finalResult' is distinct from (greatest(f.sets_a,f.sets_b)::text || 'x' || least(f.sets_a,f.sets_b)::text) then raise exception 'Campeão não corresponde à final'; end if;
      foreach v_team in array array[v_champion,v_runner] loop
        if not exists(select 1 from public.truco_team_memberships where truco_championship_id = c.truco_id and truco_team_id = v_team) then raise exception 'Participação histórica ausente'; end if;
        if not exists(select 1 from public.truco_team_members where truco_team_id = v_team) then
          insert into public.truco_team_members(truco_team_id,truco_player_id,position)
            select v_team,truco_player_1_id,1 from public.truco_team_memberships where truco_championship_id = c.truco_id and truco_team_id = v_team
            union all select v_team,truco_player_2_id,2 from public.truco_team_memberships where truco_championship_id = c.truco_id and truco_team_id = v_team;
        end if;
        if (select count(*) from public.truco_team_members where truco_team_id = v_team) <> 2 or not exists (
          select 1 from public.truco_team_memberships p
            join public.truco_team_members a on a.truco_team_id=p.truco_team_id and a.position=1 and a.truco_player_id=p.truco_player_1_id
            join public.truco_team_members b on b.truco_team_id=p.truco_team_id and b.position=2 and b.truco_player_id=p.truco_player_2_id
            where p.truco_championship_id=c.truco_id and p.truco_team_id=v_team
        ) then raise exception using errcode='23514',message='Par histórico incompatível; revisar sem sobrescrever títulos antigos'; end if;
      end loop;
      -- Compatibilidade explícita: há schemas históricos com e sem championship_id.
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name='truco_history' and column_name='truco_championship_id') then
        execute 'insert into public.truco_history as h(truco_championship_id,edition,name,year,champion_team_id,runner_up_team_id,final_result,notes)
          values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(edition) do update set champion_team_id=excluded.champion_team_id,
          runner_up_team_id=excluded.runner_up_team_id,final_result=excluded.final_result where h.truco_championship_id=$1'
          using c.truco_id,c.edition,c.name,c.year,v_champion,v_runner,s->>'finalResult','Campeão registrado automaticamente pela final.';
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then raise exception 'Histórico vinculado a outra edição; revisão necessária'; end if;
      else
        insert into public.truco_history(edition,name,year,champion_team_id,runner_up_team_id,final_result,notes)
          values(c.edition,c.name,c.year,v_champion,v_runner,s->>'finalResult','Campeão registrado automaticamente pela final.')
          on conflict(edition) do update set champion_team_id = excluded.champion_team_id,runner_up_team_id = excluded.runner_up_team_id,final_result = excluded.final_result;
      end if;
      update public.truco_championships set progression_revision = progression_revision + 1 where truco_id = c.truco_id;
    when 'set-phase' then
      if s->>'phase' not in ('Fase de Grupos','Mata-mata','Campeonato Finalizado') then raise exception 'Fase inválida'; end if;
      if s->>'phase' = 'Campeonato Finalizado' and not exists(select 1 from public.truco_history where edition = c.edition) then raise exception 'Campeão ausente'; end if;
      update public.truco_championships set current_phase = s->>'phase' where truco_id = c.truco_id;
    else raise exception 'Passo de plano desconhecido';
    end case;
  end loop;
  -- O backend só envia um plano vazio após reler e confirmar que não há passos/anomalias.
  update public.truco_championships set progression_pending=(jsonb_array_length(p_steps)>0) where truco_id=c.truco_id;
end $$;

-- Auditoria de truco_championships: o gatilho que já existe (truco_trg_audit_championships) grava
-- uma linha a cada UPDATE. Com o contador de revisão e o marcador de pendência acima, cada placar
-- passaria a gerar várias linhas sem informação (263 de 423 linhas num campeonato inteiro, medido
-- na homologação local de 09/10/2026). O gatilho continua igual para INSERT e DELETE; para
-- UPDATE ele só dispara quando muda algo além de revisão, pendência e updated_at — cadeado,
-- fase, status e nome continuam auditados como antes.
drop trigger if exists truco_trg_audit_championships on public.truco_championships;
create trigger truco_trg_audit_championships after insert or delete on public.truco_championships
  for each row execute function public.truco_fn_audit();
drop trigger if exists truco_trg_audit_championships_update on public.truco_championships;
create trigger truco_trg_audit_championships_update after update on public.truco_championships
  for each row
  when ((to_jsonb(new) - 'progression_revision' - 'progression_pending' - 'updated_at')
    is distinct from (to_jsonb(old) - 'progression_revision' - 'progression_pending' - 'updated_at'))
  execute function public.truco_fn_audit();

revoke all on function public.truco_fn_championship_revision() from public,anon,authenticated;
revoke all on function public.truco_fn_edition_transition_lock() from public,anon,authenticated;
revoke all on function public.truco_fn_invalidate_progression() from public,anon,authenticated;
revoke all on function public.truco_rpc_record_match_result_v2(uuid,uuid,integer,integer,uuid,bigint) from public,anon,authenticated;
revoke all on function public.truco_rpc_apply_knockout_plan(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.truco_rpc_record_match_result_v2(uuid,uuid,integer,integer,uuid,bigint) to service_role;
grant execute on function public.truco_rpc_apply_knockout_plan(uuid,bigint,jsonb) to service_role;
commit;
