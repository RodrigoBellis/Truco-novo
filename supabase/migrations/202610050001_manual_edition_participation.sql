-- Adds edition-scoped team participation without deleting or rewriting historical rows.
-- Apply first to a Supabase staging project and inspect the backfill before production.

begin;

create table if not exists public.truco_team_memberships (
  truco_id uuid primary key default gen_random_uuid(),
  truco_championship_id uuid not null references public.truco_championships(truco_id) on delete restrict,
  truco_team_id uuid not null references public.truco_teams(truco_id) on delete restrict,
  truco_player_1_id uuid not null references public.truco_players(truco_id) on delete restrict,
  truco_player_2_id uuid not null references public.truco_players(truco_id) on delete restrict,
  truco_group_id uuid references public.truco_groups(truco_id) on delete restrict,
  strength smallint not null default 3 check (strength between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint truco_team_memberships_distinct_players check (truco_player_1_id <> truco_player_2_id),
  constraint truco_team_memberships_team_edition_unique unique (truco_championship_id, truco_team_id),
  constraint truco_team_memberships_player_1_edition_unique unique (truco_championship_id, truco_player_1_id),
  constraint truco_team_memberships_player_2_edition_unique unique (truco_championship_id, truco_player_2_id)
);

-- Backfill legacy team members in position order. Existing team and history rows remain untouched.
insert into public.truco_team_memberships (
  truco_championship_id, truco_team_id, truco_player_1_id, truco_player_2_id,
  truco_group_id, strength
)
select t.truco_championship_id, t.truco_id,
       max(tm.truco_player_id::text) filter (where tm.position = 1)::uuid,
       max(tm.truco_player_id::text) filter (where tm.position = 2)::uuid,
       t.truco_group_id, 3
from public.truco_teams t
join public.truco_team_members tm on tm.truco_team_id = t.truco_id
group by t.truco_championship_id, t.truco_id, t.truco_group_id
having count(*) filter (where tm.position in (1, 2)) = 2
on conflict (truco_championship_id, truco_team_id) do nothing;

-- The current edition is configured to five approved teams in each group. Older
-- editions are not constrained by this trigger so their existing history remains intact.
create or replace function public.truco_validate_manual_edition_team_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists truco_teams_manual_edition_capacity on public.truco_teams;
create trigger truco_teams_manual_edition_capacity
  before insert or update of status, truco_group_id on public.truco_teams
  for each row execute function public.truco_validate_manual_edition_team_capacity();

alter table public.truco_audit_log
  add column if not exists truco_championship_id uuid references public.truco_championships(truco_id) on delete set null;

create index if not exists truco_team_memberships_player_1_idx
  on public.truco_team_memberships (truco_championship_id, truco_player_1_id);
create index if not exists truco_team_memberships_player_2_idx
  on public.truco_team_memberships (truco_championship_id, truco_player_2_id);
create index if not exists truco_team_memberships_group_idx
  on public.truco_team_memberships (truco_championship_id, truco_group_id);
create index if not exists truco_audit_log_championship_match_idx
  on public.truco_audit_log (truco_championship_id, entity_id, created_at desc)
  where entity = 'match_result';

alter table public.truco_team_memberships enable row level security;
alter table public.truco_audit_log enable row level security;
alter table public.truco_matches enable row level security;
alter table public.truco_players enable row level security;
alter table public.truco_championships enable row level security;
alter table public.truco_groups enable row level security;
alter table public.truco_teams enable row level security;
alter table public.truco_team_members enable row level security;
alter table public.truco_history enable row level security;
alter table public.truco_bracket_matches enable row level security;
alter table public.truco_standings_overrides enable row level security;

create or replace function public.truco_rpc_current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select truco_player_id from public.truco_profiles where truco_id = auth.uid() limit 1;
$$;
revoke all on function public.truco_rpc_current_player_id() from public, anon;
grant execute on function public.truco_rpc_current_player_id() to authenticated;

-- Frontend direct access is read-only for public Hall of Fame/current tournament data.
drop policy if exists truco_history_public_read on public.truco_history;
create policy truco_history_public_read on public.truco_history
  for select to anon, authenticated using (true);

drop policy if exists truco_championships_public_read on public.truco_championships;
create policy truco_championships_public_read on public.truco_championships
  for select to anon, authenticated using (true);

drop policy if exists truco_teams_public_read on public.truco_teams;
create policy truco_teams_public_read on public.truco_teams
  for select to anon, authenticated using (true);

drop policy if exists truco_team_members_public_read on public.truco_team_members;
create policy truco_team_members_public_read on public.truco_team_members
  for select to anon, authenticated using (true);

drop policy if exists truco_players_public_read on public.truco_players;
create policy truco_players_public_read on public.truco_players
  for select to anon, authenticated using (true);

drop policy if exists truco_matches_scoped_read on public.truco_matches;
create policy truco_matches_scoped_read on public.truco_matches
  for select to anon, authenticated using (
    public.truco_rpc_is_admin(auth.uid())
    or (auth.uid() is null and truco_matches.status = 'realizado')
    or exists (
      select 1 from public.truco_team_memberships mine
      where mine.truco_championship_id = truco_matches.truco_championship_id
        and public.truco_rpc_current_player_id() in (mine.truco_player_1_id, mine.truco_player_2_id)
        and (
          mine.truco_team_id in (truco_matches.truco_team_a_id, truco_matches.truco_team_b_id)
          or (truco_matches.status = 'realizado' and mine.truco_group_id = truco_matches.truco_group_id)
        )
    )
  );

drop policy if exists truco_team_memberships_authenticated_read on public.truco_team_memberships;
create policy truco_team_memberships_authenticated_read on public.truco_team_memberships
  for select to authenticated using (
    public.truco_rpc_is_admin(auth.uid())
    or truco_player_1_id = public.truco_rpc_current_player_id()
    or truco_player_2_id = public.truco_rpc_current_player_id()
  );

-- No browser role can write scores or tournament structure directly. Mutations go through
-- Express, which verifies the Supabase JWT and applies per-team/admin authorization.
revoke insert, update, delete, truncate, references, trigger on public.truco_matches from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.truco_teams from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.truco_team_members from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.truco_team_memberships from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.truco_groups from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.truco_championships from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.truco_history from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.truco_players from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.truco_profiles from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.truco_bracket_matches from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.truco_standings_overrides from anon, authenticated;
revoke all on public.truco_audit_log from anon, authenticated;

grant select on public.truco_history, public.truco_championships, public.truco_teams,
  public.truco_team_members, public.truco_players to anon, authenticated;
grant select on public.truco_team_memberships to authenticated;
grant select on public.truco_matches to authenticated;

create or replace function public.truco_validate_team_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists truco_team_memberships_validate on public.truco_team_memberships;
create trigger truco_team_memberships_validate
  before insert or update on public.truco_team_memberships
  for each row execute function public.truco_validate_team_membership();

create or replace function public.truco_rpc_save_team_participation(
  p_championship_id uuid,
  p_team_id uuid,
  p_team_name text,
  p_player_1_id uuid,
  p_player_2_id uuid,
  p_group_id uuid,
  p_strength integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.truco_rpc_save_team_participation(uuid, uuid, text, uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.truco_rpc_save_team_participation(uuid, uuid, text, uuid, uuid, uuid, integer) to service_role;

create or replace function public.truco_rpc_record_match_result(
  p_championship_id uuid,
  p_match_id uuid,
  p_sets_a integer,
  p_sets_b integer,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.truco_rpc_record_match_result(uuid, uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.truco_rpc_record_match_result(uuid, uuid, integer, integer, uuid) to service_role;

commit;
