-- HOMOLOGAÇÃO LOCAL — nunca executar no Supabase.
-- Retrato dos objetos public.truco_* do projeto sfllpogpuqukhjddwiel, lido do catálogo real em
-- 09/10/2026 (somente leitura), no estado da última migration remota do Truco
-- (harden_truco_rpc_grants, 20261005232535). Sem dados. As migrations locais pendentes
-- (202610070001, 202610070002, 202610090001, 202610090002) são aplicadas DEPOIS deste arquivo,
-- sem alteração, exatamente como seriam em produção.

create type public.truco_bracket_round as enum ('oitavas', 'quartas', 'semifinal', 'final');
create type public.truco_bracket_slot_type as enum ('direct', 'winner', 'tbd');
create type public.truco_championship_status as enum ('em_andamento', 'encerrado');
create type public.truco_draw_status as enum ('pendente', 'realizado');
create type public.truco_match_stage as enum ('grupos', 'mata-mata');
create type public.truco_match_status as enum ('pendente', 'realizado');
create type public.truco_team_status as enum ('pendente', 'aprovada');
create type public.truco_user_role as enum ('jogador', 'admin', 'superadmin');

create table public.truco_players (
  truco_id uuid not null default gen_random_uuid() primary key,
  name text not null,
  nickname text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.truco_championships (
  truco_id uuid not null default gen_random_uuid() primary key,
  name text not null,
  edition integer not null,
  year integer not null,
  status public.truco_championship_status not null default 'em_andamento',
  current_phase text not null default 'Aguardando sorteio',
  draw_status public.truco_draw_status not null default 'pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint truco_uq_championships_edition unique (edition)
);

create table public.truco_audit_log (
  truco_id uuid not null default gen_random_uuid() primary key,
  truco_actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  truco_championship_id uuid references public.truco_championships(truco_id) on delete set null
);

create table public.truco_groups (
  truco_id uuid not null default gen_random_uuid() primary key,
  truco_championship_id uuid not null references public.truco_championships(truco_id) on delete cascade,
  label text not null constraint truco_groups_label_check check (label = any (array['A'::text, 'B'::text])),
  name text not null,
  created_at timestamptz not null default now(),
  constraint truco_uq_groups_champ_label unique (truco_championship_id, label)
);

create table public.truco_teams (
  truco_id uuid not null default gen_random_uuid() primary key,
  truco_championship_id uuid not null references public.truco_championships(truco_id) on delete cascade,
  truco_group_id uuid references public.truco_groups(truco_id) on delete set null,
  name text not null,
  status public.truco_team_status not null default 'pendente',
  seeded boolean not null default false,
  is_placeholder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.truco_team_members (
  truco_id uuid not null default gen_random_uuid() primary key,
  truco_team_id uuid not null references public.truco_teams(truco_id) on delete cascade,
  truco_player_id uuid not null references public.truco_players(truco_id) on delete restrict,
  "position" smallint not null constraint truco_team_members_position_check check ("position" = any (array[1, 2])),
  created_at timestamptz not null default now(),
  constraint truco_uq_team_members_team_player unique (truco_team_id, truco_player_id),
  constraint truco_uq_team_members_team_position unique (truco_team_id, "position")
);

create table public.truco_profiles (
  truco_id uuid not null primary key references auth.users(id) on delete cascade,
  truco_player_id uuid not null references public.truco_players(truco_id) on delete restrict,
  email text not null,
  role public.truco_user_role not null default 'jogador',
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint truco_profiles_truco_player_id_key unique (truco_player_id)
);

create table public.truco_matches (
  truco_id uuid not null default gen_random_uuid() primary key,
  truco_championship_id uuid not null references public.truco_championships(truco_id) on delete cascade,
  stage public.truco_match_stage not null,
  round text not null,
  match_order integer not null default 0,
  truco_group_id uuid references public.truco_groups(truco_id) on delete set null,
  truco_team_a_id uuid not null references public.truco_teams(truco_id) on delete cascade,
  truco_team_b_id uuid not null references public.truco_teams(truco_id) on delete cascade,
  sets_a integer,
  sets_b integer,
  status public.truco_match_status not null default 'pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  table_number smallint constraint truco_matches_table_number_check check (table_number >= 1 and table_number <= 3),
  block_number smallint,
  queue_position integer,
  constraint truco_chk_matches_sets_pair check ((sets_a is null) = (sets_b is null)),
  constraint truco_chk_matches_teams_distinct check (truco_team_a_id <> truco_team_b_id)
);

create table public.truco_bracket_matches (
  truco_id uuid not null default gen_random_uuid() primary key,
  truco_championship_id uuid not null references public.truco_championships(truco_id) on delete cascade,
  round public.truco_bracket_round not null,
  label text not null,
  match_order integer not null default 0,
  slot_a_type public.truco_bracket_slot_type not null,
  slot_a_team_id uuid references public.truco_teams(truco_id) on delete set null,
  slot_a_source_id uuid references public.truco_bracket_matches(truco_id) on delete set null,
  slot_b_type public.truco_bracket_slot_type not null,
  slot_b_team_id uuid references public.truco_teams(truco_id) on delete set null,
  slot_b_source_id uuid references public.truco_bracket_matches(truco_id) on delete set null,
  truco_match_id uuid references public.truco_matches(truco_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.truco_standings_overrides (
  truco_id uuid not null default gen_random_uuid() primary key,
  truco_championship_id uuid not null references public.truco_championships(truco_id) on delete cascade,
  truco_group_id uuid not null references public.truco_groups(truco_id) on delete cascade,
  tied_team_ids uuid[] not null,
  resolved_team_id uuid not null references public.truco_teams(truco_id) on delete cascade,
  resolved_position integer not null,
  criterion text not null,
  reason text,
  truco_actor_id uuid not null references public.truco_profiles(truco_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.truco_history (
  truco_id uuid not null default gen_random_uuid() primary key,
  truco_championship_id uuid not null references public.truco_championships(truco_id) on delete cascade,
  edition integer not null,
  name text not null,
  year integer not null,
  champion_team_id uuid constraint truco_history_champion_team_id_fkey references public.truco_teams(truco_id) on delete set null,
  runner_up_team_id uuid constraint truco_history_runner_up_team_id_fkey references public.truco_teams(truco_id) on delete set null,
  final_result text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint truco_uq_history_edition unique (edition)
);

create table public.truco_team_memberships (
  truco_id uuid not null default gen_random_uuid() primary key,
  truco_championship_id uuid not null references public.truco_championships(truco_id) on delete restrict,
  truco_team_id uuid not null references public.truco_teams(truco_id) on delete restrict,
  truco_player_1_id uuid not null references public.truco_players(truco_id) on delete restrict,
  truco_player_2_id uuid not null references public.truco_players(truco_id) on delete restrict,
  truco_group_id uuid references public.truco_groups(truco_id) on delete restrict,
  strength smallint not null default 3 constraint truco_team_memberships_strength_check check (strength >= 1 and strength <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint truco_team_memberships_distinct_players check (truco_player_1_id <> truco_player_2_id),
  constraint truco_team_memberships_team_edition_unique unique (truco_championship_id, truco_team_id),
  constraint truco_team_memberships_player_1_edition_unique unique (truco_championship_id, truco_player_1_id),
  constraint truco_team_memberships_player_2_edition_unique unique (truco_championship_id, truco_player_2_id)
);

create index truco_idx_players_name on public.truco_players (name);
create index truco_idx_audit_log_entity on public.truco_audit_log (entity, entity_id);
create index truco_idx_audit_log_actor on public.truco_audit_log (truco_actor_id);
create index truco_idx_audit_log_created_at on public.truco_audit_log (created_at desc);
create index truco_audit_log_championship_match_idx on public.truco_audit_log (truco_championship_id, entity_id, created_at desc) where (entity = 'match_result');
create index truco_idx_groups_championship on public.truco_groups (truco_championship_id);
create index truco_idx_teams_championship on public.truco_teams (truco_championship_id);
create index truco_idx_teams_group on public.truco_teams (truco_group_id);
create index truco_idx_teams_status on public.truco_teams (status);
create index truco_idx_team_members_team on public.truco_team_members (truco_team_id);
create index truco_idx_team_members_player on public.truco_team_members (truco_player_id);
create index truco_idx_profiles_player on public.truco_profiles (truco_player_id);
create index truco_idx_profiles_role on public.truco_profiles (role);
create index truco_idx_matches_championship on public.truco_matches (truco_championship_id);
create index truco_idx_matches_group on public.truco_matches (truco_group_id);
create index truco_idx_matches_team_a on public.truco_matches (truco_team_a_id);
create index truco_idx_matches_team_b on public.truco_matches (truco_team_b_id);
create index truco_idx_matches_status on public.truco_matches (status);
create index truco_idx_matches_queue on public.truco_matches (queue_position);
create index truco_idx_bracket_championship on public.truco_bracket_matches (truco_championship_id);
create index truco_idx_bracket_match on public.truco_bracket_matches (truco_match_id);
create index truco_idx_standings_overrides_group on public.truco_standings_overrides (truco_championship_id, truco_group_id);
create index truco_idx_history_championship on public.truco_history (truco_championship_id);
create index truco_idx_history_champion_team on public.truco_history (champion_team_id);
create index truco_team_memberships_player_1_idx on public.truco_team_memberships (truco_championship_id, truco_player_1_id);
create index truco_team_memberships_player_2_idx on public.truco_team_memberships (truco_championship_id, truco_player_2_id);
create index truco_team_memberships_group_idx on public.truco_team_memberships (truco_championship_id, truco_group_id);

-- ---------- Funções (corpos copiados de pg_get_functiondef) ----------

create or replace function public.truco_fn_audit()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  v_entity_id uuid;
begin
  v_entity_id := coalesce(new.truco_id, old.truco_id);
  insert into public.truco_audit_log (truco_actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), lower(tg_op), tg_table_name, v_entity_id,
    case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$function$;

create or replace function public.truco_fn_check_team_size()
 returns trigger language plpgsql set search_path to ''
as $function$
declare
  member_count int;
begin
  select count(*) into member_count
  from public.truco_team_members
  where truco_team_id = new.truco_team_id;

  if member_count >= 2 then
    raise exception 'Uma dupla (truco_teams) só pode ter 2 integrantes.';
  end if;
  return new;
end;
$function$;

create or replace function public.truco_fn_handle_new_user()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  insert into public.truco_audit_log (truco_actor_id, action, entity, entity_id, metadata)
  values (null, 'auth_user_created', 'auth.users', new.id, jsonb_build_object('email', new.email));
  return new;
end;
$function$;

create or replace function public.truco_rpc_is_superadmin(p_uid uuid)
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists (
    select 1 from public.truco_profiles where truco_id = p_uid and role = 'superadmin'
  );
$function$;

create or replace function public.truco_rpc_is_admin(p_uid uuid)
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists (
    select 1 from public.truco_profiles
    where truco_id = p_uid and role in ('admin','superadmin')
  );
$function$;

create or replace function public.truco_fn_prevent_self_role_escalation()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if new.role <> old.role and not public.truco_rpc_is_superadmin(auth.uid()) then
    raise exception 'Somente superadmin pode alterar o papel (role) de um perfil.';
  end if;
  return new;
end;
$function$;

create or replace function public.truco_fn_set_updated_at()
 returns trigger language plpgsql set search_path to ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.truco_rpc_current_player_id()
 returns uuid language sql stable security definer set search_path to 'public'
as $function$
  select truco_player_id from public.truco_profiles where truco_id = auth.uid() limit 1;
$function$;

create or replace function public.truco_rpc_record_match_result(p_championship_id uuid, p_match_id uuid, p_sets_a integer, p_sets_b integer, p_actor_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_match public.truco_matches%rowtype;
begin
  if (p_sets_a, p_sets_b) not in ((2, 0), (2, 1), (1, 2), (0, 2)) then
    raise exception 'Placar inválido; use 2x0, 2x1, 1x2 ou 0x2';
  end if;

  select * into v_match from public.truco_matches
    where truco_id = p_match_id and truco_championship_id = p_championship_id
    for update;
  if not found then raise exception 'Partida não encontrada nesta edição'; end if;

  update public.truco_matches
    set sets_a = p_sets_a, sets_b = p_sets_b, status = 'realizado', updated_at = now()
    where truco_id = p_match_id;

  insert into public.truco_audit_log (
    truco_championship_id, entity, entity_id, action, truco_actor_id, metadata
  ) values (
    p_championship_id, 'match_result', p_match_id,
    case when v_match.sets_a is null then 'result_created' else 'result_updated' end,
    p_actor_id,
    jsonb_build_object(
      'previous', case when v_match.sets_a is null then null else jsonb_build_object('setsA', v_match.sets_a, 'setsB', v_match.sets_b) end,
      'next', jsonb_build_object('setsA', p_sets_a, 'setsB', p_sets_b)
    )
  );
end;
$function$;

create or replace function public.truco_rpc_resolve_standings_tie(p_championship_id uuid, p_group_id uuid, p_tied_team_ids uuid[], p_resolved_team_id uuid, p_resolved_position integer, p_criterion text, p_reason text)
 returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_override_id uuid;
begin
  if not public.truco_rpc_is_admin(auth.uid()) then
    raise exception 'Apenas administradores podem resolver desempates.';
  end if;

  insert into public.truco_standings_overrides (
    truco_championship_id, truco_group_id, tied_team_ids, resolved_team_id,
    resolved_position, criterion, reason, truco_actor_id
  ) values (
    p_championship_id, p_group_id, p_tied_team_ids, p_resolved_team_id,
    p_resolved_position, p_criterion, p_reason, auth.uid()
  ) returning truco_id into v_override_id;

  insert into public.truco_audit_log (truco_actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'resolve_standings_tie', 'truco_standings_overrides', v_override_id,
    jsonb_build_object('championship_id', p_championship_id, 'group_id', p_group_id,
      'tied_team_ids', p_tied_team_ids, 'resolved_team_id', p_resolved_team_id, 'criterion', p_criterion));

  return v_override_id;
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

-- truco_rpc_champions_ranking e truco_rpc_standings existem no banco real, mas o aplicativo não
-- as chama (ranking e classificação são calculados no backend). Não foram copiadas.

-- ---------- Gatilhos ----------

create trigger truco_team_memberships_validate before insert or update on public.truco_team_memberships for each row execute function public.truco_validate_team_membership();
create trigger truco_teams_manual_edition_capacity before insert or update of status, truco_group_id on public.truco_teams for each row execute function public.truco_validate_manual_edition_team_capacity();
create trigger truco_trg_audit_championships after insert or delete or update on public.truco_championships for each row execute function public.truco_fn_audit();
create trigger truco_trg_audit_matches after insert or delete or update on public.truco_matches for each row execute function public.truco_fn_audit();
create trigger truco_trg_audit_teams after insert or delete or update on public.truco_teams for each row execute function public.truco_fn_audit();
create trigger truco_trg_bracket_matches_updated_at before update on public.truco_bracket_matches for each row execute function public.truco_fn_set_updated_at();
create trigger truco_trg_championships_updated_at before update on public.truco_championships for each row execute function public.truco_fn_set_updated_at();
create trigger truco_trg_matches_updated_at before update on public.truco_matches for each row execute function public.truco_fn_set_updated_at();
create trigger truco_trg_players_updated_at before update on public.truco_players for each row execute function public.truco_fn_set_updated_at();
create trigger truco_trg_profiles_role_guard before update on public.truco_profiles for each row execute function public.truco_fn_prevent_self_role_escalation();
create trigger truco_trg_profiles_updated_at before update on public.truco_profiles for each row execute function public.truco_fn_set_updated_at();
create trigger truco_trg_team_members_max_two before insert on public.truco_team_members for each row execute function public.truco_fn_check_team_size();
create trigger truco_trg_teams_updated_at before update on public.truco_teams for each row execute function public.truco_fn_set_updated_at();
create trigger truco_trg_auth_user_created after insert on auth.users for each row execute function public.truco_fn_handle_new_user();

-- ---------- Privilégios (ACLs lidas do catálogo real) ----------

revoke all on all functions in schema public from public;
grant execute on function public.truco_fn_audit() to service_role;
grant execute on function public.truco_fn_check_team_size() to service_role;
grant execute on function public.truco_fn_handle_new_user() to service_role;
grant execute on function public.truco_fn_prevent_self_role_escalation() to service_role;
grant execute on function public.truco_fn_set_updated_at() to service_role;
grant execute on function public.truco_rpc_current_player_id() to authenticated, service_role;
grant execute on function public.truco_rpc_is_admin(uuid) to authenticated, service_role;
grant execute on function public.truco_rpc_is_superadmin(uuid) to authenticated, service_role;
grant execute on function public.truco_rpc_record_match_result(uuid, uuid, integer, integer, uuid) to service_role;
grant execute on function public.truco_rpc_resolve_standings_tie(uuid, uuid, uuid[], uuid, integer, text, text) to authenticated, service_role;
grant execute on function public.truco_rpc_save_team_participation(uuid, uuid, text, uuid, uuid, uuid, integer) to service_role;

grant all on public.truco_audit_log, public.truco_bracket_matches, public.truco_championships, public.truco_groups,
  public.truco_history, public.truco_matches, public.truco_players, public.truco_profiles, public.truco_standings_overrides,
  public.truco_team_members, public.truco_team_memberships, public.truco_teams to service_role;
grant select on public.truco_bracket_matches, public.truco_championships, public.truco_groups, public.truco_history,
  public.truco_matches, public.truco_players, public.truco_profiles, public.truco_standings_overrides,
  public.truco_team_members, public.truco_team_memberships, public.truco_teams to anon, authenticated;

-- ---------- RLS (políticas lidas de pg_policies) ----------

alter table public.truco_audit_log enable row level security;
alter table public.truco_bracket_matches enable row level security;
alter table public.truco_championships enable row level security;
alter table public.truco_groups enable row level security;
alter table public.truco_history enable row level security;
alter table public.truco_matches enable row level security;
alter table public.truco_players enable row level security;
alter table public.truco_profiles enable row level security;
alter table public.truco_standings_overrides enable row level security;
alter table public.truco_team_members enable row level security;
alter table public.truco_team_memberships enable row level security;
alter table public.truco_teams enable row level security;

create policy truco_audit_log_select_admin on public.truco_audit_log for select to authenticated using (public.truco_rpc_is_admin(auth.uid()));
create policy truco_bracket_matches_select_public on public.truco_bracket_matches for select to anon, authenticated using (true);
create policy truco_bracket_matches_write_admin on public.truco_bracket_matches for all to authenticated using (public.truco_rpc_is_admin(auth.uid())) with check (public.truco_rpc_is_admin(auth.uid()));
create policy truco_championships_select_public on public.truco_championships for select to anon, authenticated using (true);
create policy truco_championships_write_admin on public.truco_championships for all to authenticated using (public.truco_rpc_is_admin(auth.uid())) with check (public.truco_rpc_is_admin(auth.uid()));
create policy truco_groups_select_public on public.truco_groups for select to anon, authenticated using (true);
create policy truco_groups_write_admin on public.truco_groups for all to authenticated using (public.truco_rpc_is_admin(auth.uid())) with check (public.truco_rpc_is_admin(auth.uid()));
create policy truco_history_select_public on public.truco_history for select to anon, authenticated using (true);
create policy truco_history_write_admin on public.truco_history for all to authenticated using (public.truco_rpc_is_admin(auth.uid())) with check (public.truco_rpc_is_admin(auth.uid()));
create policy truco_matches_scoped_read on public.truco_matches for select to anon, authenticated using (
  public.truco_rpc_is_admin(auth.uid())
  or (auth.uid() is null and status = 'realizado')
  or exists (
    select 1 from public.truco_team_memberships mine
    where mine.truco_championship_id = truco_matches.truco_championship_id
      and (public.truco_rpc_current_player_id() = mine.truco_player_1_id or public.truco_rpc_current_player_id() = mine.truco_player_2_id)
      and (mine.truco_team_id = any (array[truco_matches.truco_team_a_id, truco_matches.truco_team_b_id])
        or (truco_matches.status = 'realizado' and mine.truco_group_id = truco_matches.truco_group_id))
  ));
create policy truco_matches_write_admin on public.truco_matches for all to authenticated using (public.truco_rpc_is_admin(auth.uid())) with check (public.truco_rpc_is_admin(auth.uid()));
create policy truco_players_select_public on public.truco_players for select to anon, authenticated using (true);
create policy truco_players_insert_admin on public.truco_players for insert to authenticated with check (public.truco_rpc_is_admin(auth.uid()));
create policy truco_players_update_admin on public.truco_players for update to authenticated using (public.truco_rpc_is_admin(auth.uid())) with check (public.truco_rpc_is_admin(auth.uid()));
create policy truco_profiles_select on public.truco_profiles for select to authenticated using (truco_id = auth.uid() or public.truco_rpc_is_admin(auth.uid()));
create policy truco_profiles_update on public.truco_profiles for update to authenticated using (truco_id = auth.uid() or public.truco_rpc_is_admin(auth.uid())) with check (truco_id = auth.uid() or public.truco_rpc_is_admin(auth.uid()));
create policy truco_standings_overrides_select_admin on public.truco_standings_overrides for select to authenticated using (public.truco_rpc_is_admin(auth.uid()));
create policy truco_team_members_select_public on public.truco_team_members for select to anon, authenticated using (true);
create policy truco_team_members_write_admin on public.truco_team_members for all to authenticated using (public.truco_rpc_is_admin(auth.uid())) with check (public.truco_rpc_is_admin(auth.uid()));
create policy truco_team_memberships_authenticated_read on public.truco_team_memberships for select to authenticated using (public.truco_rpc_is_admin(auth.uid()) or truco_player_1_id = public.truco_rpc_current_player_id() or truco_player_2_id = public.truco_rpc_current_player_id());
create policy truco_teams_select_public on public.truco_teams for select to anon, authenticated using (true);
create policy truco_teams_write_admin on public.truco_teams for all to authenticated using (public.truco_rpc_is_admin(auth.uid())) with check (public.truco_rpc_is_admin(auth.uid()));
