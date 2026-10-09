-- REVERSÃO das migrations de 07/10 e 09/10/2026 (202610070001, 202610070002, 202610090001,
-- 202610090002). NÃO APLICADA. Usar só se a aplicação dessas migrations precisar ser desfeita,
-- com autorização do dono do projeto e DEPOIS de voltar o backend para a versão anterior.
--
-- O que faz: remove gatilhos, funções, índices e colunas criados por elas e recria, com o corpo
-- que existia no banco em 09/10/2026 (lido do catálogo), as três funções que a 202610070001
-- substituiu e o gatilho de auditoria de truco_championships.
-- O que NÃO faz: não apaga nem altera jogos, placares, duplas, participações, contas, histórico
-- ou auditoria. O estado do cadeado (results_locked) deixa de existir junto com a coluna.
--
-- Não desfaz dados gravados pelo campeonato depois das migrations (chaveamento, jogos de
-- mata-mata, campeão): para isso existe o retrato truco_backup_* descrito no plano de aplicação.
-- Validada no PostgreSQL local de homologação: depois dela, colunas, gatilhos, funções e
-- índices de public.truco_* voltam a ser idênticos aos do retrato remoto.
begin;

-- 202610090002
drop trigger if exists truco_trg_audit_championships_update on public.truco_championships;
drop trigger if exists truco_trg_audit_championships on public.truco_championships;
create trigger truco_trg_audit_championships after insert or delete or update on public.truco_championships
  for each row execute function public.truco_fn_audit();
do $$ declare v_table text; begin
  foreach v_table in array array['truco_matches','truco_bracket_matches','truco_team_memberships','truco_teams','truco_groups','truco_standings_overrides','truco_profiles','truco_history','truco_team_members'] loop
    execute format('drop trigger if exists truco_invalidate_progression on public.%I', v_table);
  end loop;
end $$;
drop trigger if exists truco_championship_revision on public.truco_championships;
drop trigger if exists truco_active_edition_lock on public.truco_championships;
drop function if exists public.truco_rpc_apply_knockout_plan(uuid, bigint, jsonb);
drop function if exists public.truco_rpc_record_match_result_v2(uuid, uuid, integer, integer, uuid, bigint);
drop function if exists public.truco_fn_invalidate_progression();
drop function if exists public.truco_fn_championship_revision();
drop function if exists public.truco_fn_edition_transition_lock();
alter table public.truco_championships drop column if exists progression_pending;
alter table public.truco_championships drop column if exists progression_revision;

-- 202610090001
drop index if exists public.truco_matches_knockout_slot_unique;
drop index if exists public.truco_bracket_matches_match_unique;
drop index if exists public.truco_bracket_matches_slot_unique;

-- 202610070002
alter table public.truco_championships drop column if exists results_locked;

-- 202610070001
drop trigger if exists truco_matches_validate_group on public.truco_matches;
drop trigger if exists truco_teams_sync_membership_group on public.truco_teams;
drop trigger if exists truco_teams_guard_group_change on public.truco_teams;
drop function if exists public.truco_validate_group_match();
drop function if exists public.truco_sync_membership_group();
drop function if exists public.truco_guard_team_group_change();

create or replace function public.truco_validate_manual_edition_team_capacity()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_edition integer;
  v_count integer;
  v_group_count integer;
begin
  select edition into v_edition from public.truco_championships where truco_id = new.truco_championship_id;
  if v_edition is distinct from 5 or new.status <> 'aprovada' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.truco_championship_id::text, 0));
  select count(*) into v_count from public.truco_teams
    where truco_championship_id = new.truco_championship_id and status = 'aprovada' and truco_id <> new.truco_id;
  if v_count >= 10 then raise exception 'A 5ª edição aceita dez duplas aprovadas'; end if;

  select count(*) into v_group_count from public.truco_teams
    where truco_championship_id = new.truco_championship_id and status = 'aprovada'
      and truco_group_id = new.truco_group_id and truco_id <> new.truco_id;
  if v_group_count >= 5 then raise exception 'Cada grupo da 5ª edição aceita cinco duplas'; end if;
  return new;
end;
$function$;

create or replace function public.truco_validate_team_membership()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_team_championship uuid;
  v_group_championship uuid;
  v_group_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.truco_championship_id::text, 0));

  select truco_championship_id into v_team_championship
    from public.truco_teams where truco_id = new.truco_team_id;
  if v_team_championship is distinct from new.truco_championship_id then
    raise exception 'A dupla não pertence a esta edição';
  end if;

  if new.truco_group_id is not null then
    select truco_championship_id into v_group_championship
      from public.truco_groups where truco_id = new.truco_group_id;
    if v_group_championship is distinct from new.truco_championship_id then
      raise exception 'O grupo não pertence a esta edição';
    end if;

    select count(*) into v_group_count from public.truco_team_memberships
      where truco_championship_id = new.truco_championship_id
        and truco_group_id = new.truco_group_id
        and truco_team_id <> new.truco_team_id;
    if v_group_count >= 5 then
      raise exception 'O grupo já contém cinco duplas';
    end if;
  end if;

  if exists (
    select 1 from public.truco_team_memberships m
      where m.truco_championship_id = new.truco_championship_id
        and m.truco_team_id <> new.truco_team_id
        and new.truco_player_1_id in (m.truco_player_1_id, m.truco_player_2_id)
  ) or exists (
    select 1 from public.truco_team_memberships m
      where m.truco_championship_id = new.truco_championship_id
        and m.truco_team_id <> new.truco_team_id
        and new.truco_player_2_id in (m.truco_player_1_id, m.truco_player_2_id)
  ) then
    raise exception 'O jogador já participa de outra dupla nesta edição';
  end if;
  return new;
end;
$function$;

create or replace function public.truco_rpc_save_team_participation(p_championship_id uuid, p_team_id uuid, p_team_name text, p_player_1_id uuid, p_player_2_id uuid, p_group_id uuid, p_strength integer)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_team_id uuid := coalesce(p_team_id, gen_random_uuid());
begin
  if p_team_name is null or length(trim(p_team_name)) = 0 then raise exception 'Informe o nome da dupla'; end if;
  if p_player_1_id = p_player_2_id then raise exception 'A dupla precisa de dois jogadores diferentes'; end if;
  if p_strength is null or p_strength < 1 or p_strength > 5 then raise exception 'A força deve ser entre 1 e 5'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_championship_id::text, 0));
  if p_team_id is null then
    if (select count(*) from public.truco_teams where truco_championship_id = p_championship_id and status = 'aprovada') >= 10 then
      raise exception 'A edição aceita dez duplas';
    end if;
    if (select count(*) from public.truco_team_memberships where truco_championship_id = p_championship_id and truco_group_id = p_group_id) >= 5 then
      raise exception 'O grupo já contém cinco duplas';
    end if;
  else
    if not exists (
      select 1 from public.truco_teams where truco_id = p_team_id and truco_championship_id = p_championship_id
    ) then raise exception 'Participação não encontrada nesta edição'; end if;
    if (select status from public.truco_teams where truco_id = p_team_id) = 'aprovada' then
      if (select count(*) from public.truco_team_memberships where truco_championship_id = p_championship_id and truco_group_id = p_group_id and truco_team_id <> p_team_id) >= 5 then
        raise exception 'O grupo já contém cinco duplas';
      end if;
    else
      if (select count(*) from public.truco_teams where truco_championship_id = p_championship_id and status = 'aprovada') >= 10
        or (select count(*) from public.truco_team_memberships where truco_championship_id = p_championship_id and truco_group_id = p_group_id and truco_team_id <> p_team_id) >= 5 then
        raise exception 'A edição aceita dez duplas, cinco por grupo';
      end if;
    end if;
  end if;

  if p_team_id is null then
    insert into public.truco_teams (
      truco_id, truco_championship_id, name, status, seeded, is_placeholder, truco_group_id
    ) values (
      v_team_id, p_championship_id, trim(p_team_name), 'aprovada', false, false, p_group_id
    );
    insert into public.truco_team_memberships (
      truco_championship_id, truco_team_id, truco_player_1_id, truco_player_2_id, truco_group_id, strength
    ) values (
      p_championship_id, v_team_id, p_player_1_id, p_player_2_id, p_group_id, p_strength
    );
  else
    update public.truco_team_memberships
      set truco_player_1_id = p_player_1_id,
          truco_player_2_id = p_player_2_id,
          truco_group_id = p_group_id,
          strength = p_strength,
          updated_at = now()
      where truco_championship_id = p_championship_id and truco_team_id = p_team_id;
    if not found then raise exception 'Participação não encontrada nesta edição'; end if;
    update public.truco_teams
      set name = trim(p_team_name), truco_group_id = p_group_id, updated_at = now()
      where truco_id = p_team_id and truco_championship_id = p_championship_id;
    if not found then raise exception 'Dupla não encontrada nesta edição'; end if;
  end if;
  return v_team_id;
end;
$function$;

drop function if exists public.truco_fn_teams_per_group();

revoke all on function public.truco_validate_manual_edition_team_capacity() from public, anon, authenticated, service_role;
revoke all on function public.truco_validate_team_membership() from public, anon, authenticated, service_role;
revoke all on function public.truco_rpc_save_team_participation(uuid, uuid, text, uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.truco_rpc_save_team_participation(uuid, uuid, text, uuid, uuid, uuid, integer) to service_role;

commit;
