-- 5ª edição: formato definitivo de 12 duplas (6 no Grupo A e 6 no Grupo B) e grupo da dupla
-- com uma única fonte de verdade.
--
-- O que NÃO faz: não cria, apaga nem altera duplas, jogadores, participações, partidas ou
-- placares. As duas duplas que faltam serão cadastradas depois pelo administrador; os jogos
-- delas entram pela rota POST /groups/complete-matches, que só cria os confrontos que faltam.
--
-- Fonte única do grupo: public.truco_teams.truco_group_id — a coluna que truco_rpc_standings e
-- a lista de cada grupo já usam. public.truco_team_memberships.truco_group_id passa a ser um
-- espelho mantido pelo próprio banco (a política de leitura de partidas ainda o consulta):
-- qualquer valor gravado nela é substituído pelo grupo da dupla.
-- Partidas de grupo também guardam o grupo; elas precisam bater com as duas duplas, e a dupla
-- não troca de grupo depois de ter jogos gerados.
--
-- Critério de desempate: inalterado (pontos, saldo de sets, vitórias e desempate manual em
-- truco_standings_overrides). Empate exato continua pendente de decisão do organizador.

begin;

-- Um só número para o banco inteiro; o app repete o mesmo valor em @truco/shared (TEAMS_PER_GROUP).
create or replace function public.truco_fn_teams_per_group()
returns integer
language sql
immutable
set search_path = ''
as $$ select 6 $$;

-- Limite de duplas aprovadas na 5ª edição: 12 no total, 6 por grupo.
create or replace function public.truco_validate_manual_edition_team_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edition integer;
  v_per_group integer := public.truco_fn_teams_per_group();
  v_count integer;
  v_group_count integer;
begin
  select edition into v_edition from public.truco_championships where truco_id = new.truco_championship_id;
  if v_edition is distinct from 5 or new.status <> 'aprovada' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.truco_championship_id::text, 0));
  select count(*) into v_count from public.truco_teams
    where truco_championship_id = new.truco_championship_id and status = 'aprovada' and truco_id <> new.truco_id;
  if v_count >= 2 * v_per_group then
    raise exception 'A 5ª edição aceita % duplas aprovadas', 2 * v_per_group;
  end if;

  select count(*) into v_group_count from public.truco_teams
    where truco_championship_id = new.truco_championship_id and status = 'aprovada'
      and truco_group_id = new.truco_group_id and truco_id <> new.truco_id;
  if v_group_count >= v_per_group then
    raise exception 'Cada grupo da 5ª edição aceita % duplas', v_per_group;
  end if;
  return new;
end;
$$;

-- Participação: o grupo é copiado da dupla; o limite por grupo é conferido em truco_teams.
create or replace function public.truco_validate_team_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_championship uuid;
  v_team_group uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.truco_championship_id::text, 0));

  select truco_championship_id, truco_group_id into v_team_championship, v_team_group
    from public.truco_teams where truco_id = new.truco_team_id;
  if v_team_championship is distinct from new.truco_championship_id then
    raise exception 'A dupla não pertence a esta edição';
  end if;

  new.truco_group_id := v_team_group;

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

-- Dupla com jogos de grupo gerados não muda de grupo (as partidas guardam o grupo original).
create or replace function public.truco_guard_team_group_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.truco_group_id is distinct from old.truco_group_id and exists (
    select 1 from public.truco_matches m
      where m.truco_championship_id = new.truco_championship_id
        and m.stage = 'grupos'
        and new.truco_id in (m.truco_team_a_id, m.truco_team_b_id)
  ) then
    raise exception 'A dupla já tem jogos na fase de grupos; não é possível mudar o grupo dela';
  end if;
  return new;
end;
$$;

drop trigger if exists truco_teams_guard_group_change on public.truco_teams;
create trigger truco_teams_guard_group_change
  before update of truco_group_id on public.truco_teams
  for each row execute function public.truco_guard_team_group_change();

-- Espelho: toda mudança de grupo na dupla (cadastro, sorteio, reset) chega à participação.
create or replace function public.truco_sync_membership_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.truco_team_memberships
    set truco_group_id = new.truco_group_id, updated_at = now()
    where truco_team_id = new.truco_id
      and truco_championship_id = new.truco_championship_id
      and truco_group_id is distinct from new.truco_group_id;
  return null;
end;
$$;

drop trigger if exists truco_teams_sync_membership_group on public.truco_teams;
create trigger truco_teams_sync_membership_group
  after update of truco_group_id on public.truco_teams
  for each row execute function public.truco_sync_membership_group();

-- Partida de grupo sempre no mesmo grupo das duas duplas.
create or replace function public.truco_validate_group_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage <> 'grupos' then return new; end if;
  if new.truco_group_id is null or exists (
    select 1 from public.truco_teams t
      where t.truco_id in (new.truco_team_a_id, new.truco_team_b_id)
        and t.truco_group_id is distinct from new.truco_group_id
  ) then
    raise exception 'O jogo de grupo precisa estar no mesmo grupo das duas duplas';
  end if;
  return new;
end;
$$;

drop trigger if exists truco_matches_validate_group on public.truco_matches;
create trigger truco_matches_validate_group
  before insert or update of stage, truco_group_id, truco_team_a_id, truco_team_b_id on public.truco_matches
  for each row execute function public.truco_validate_group_match();

-- Cadastro/edição pelo administrador (via Express): grava o grupo só na dupla.
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
  v_per_group integer := public.truco_fn_teams_per_group();
  v_status public.truco_team_status;
begin
  if p_team_name is null or length(trim(p_team_name)) = 0 then raise exception 'Informe o nome da dupla'; end if;
  if p_player_1_id = p_player_2_id then raise exception 'A dupla precisa de dois jogadores diferentes'; end if;
  if p_strength is null or p_strength < 1 or p_strength > 5 then raise exception 'A força deve ser entre 1 e 5'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_championship_id::text, 0));
  if p_team_id is not null then
    select status into v_status from public.truco_teams
      where truco_id = p_team_id and truco_championship_id = p_championship_id;
    if not found then raise exception 'Participação não encontrada nesta edição'; end if;
  end if;

  if v_status is distinct from 'aprovada' and (
    select count(*) from public.truco_teams where truco_championship_id = p_championship_id and status = 'aprovada'
  ) >= 2 * v_per_group then
    raise exception 'A edição aceita % duplas, % por grupo', 2 * v_per_group, v_per_group;
  end if;
  if (
    select count(*) from public.truco_teams
      where truco_championship_id = p_championship_id and status = 'aprovada'
        and truco_group_id = p_group_id and truco_id <> v_team_id
  ) >= v_per_group then
    raise exception 'O grupo já contém % duplas', v_per_group;
  end if;

  if p_team_id is null then
    insert into public.truco_teams (
      truco_id, truco_championship_id, name, status, seeded, is_placeholder, truco_group_id
    ) values (
      v_team_id, p_championship_id, trim(p_team_name), 'aprovada', false, false, p_group_id
    );
    insert into public.truco_team_memberships (
      truco_championship_id, truco_team_id, truco_player_1_id, truco_player_2_id, strength
    ) values (
      p_championship_id, v_team_id, p_player_1_id, p_player_2_id, p_strength
    );
  else
    update public.truco_teams
      set name = trim(p_team_name), truco_group_id = p_group_id, updated_at = now()
      where truco_id = p_team_id and truco_championship_id = p_championship_id;
    update public.truco_team_memberships
      set truco_player_1_id = p_player_1_id,
          truco_player_2_id = p_player_2_id,
          strength = p_strength,
          updated_at = now()
      where truco_championship_id = p_championship_id and truco_team_id = p_team_id;
    if not found then raise exception 'Participação não encontrada nesta edição'; end if;
  end if;
  return v_team_id;
end;
$$;

-- Alinha o espelho (hoje já igual em todas as participações; não muda nenhuma linha divergente
-- que não exista) e confirma que nada ficou diferente.
update public.truco_team_memberships m
  set truco_group_id = t.truco_group_id, updated_at = now()
  from public.truco_teams t
  where t.truco_id = m.truco_team_id and m.truco_group_id is distinct from t.truco_group_id;

do $$
begin
  if exists (
    select 1 from public.truco_team_memberships m
      join public.truco_teams t on t.truco_id = m.truco_team_id
      where m.truco_group_id is distinct from t.truco_group_id
  ) then
    raise exception 'Grupo divergente entre truco_teams e truco_team_memberships';
  end if;
  if exists (
    select 1 from public.truco_matches m
      join public.truco_teams a on a.truco_id = m.truco_team_a_id
      join public.truco_teams b on b.truco_id = m.truco_team_b_id
      where m.stage = 'grupos'
        and (m.truco_group_id is distinct from a.truco_group_id or m.truco_group_id is distinct from b.truco_group_id)
  ) then
    raise exception 'Há jogo de grupo em grupo diferente do das duplas';
  end if;
end;
$$;

comment on column public.truco_teams.truco_group_id is
  'Fonte única do grupo da dupla na edição. Usada pela classificação, pela lista do grupo e pelo app.';
comment on column public.truco_team_memberships.truco_group_id is
  'Espelho de truco_teams.truco_group_id mantido por gatilho; não gravar diretamente.';

revoke all on function public.truco_fn_teams_per_group() from public, anon, authenticated;
revoke execute on function public.truco_validate_manual_edition_team_capacity() from public, anon, authenticated, service_role;
revoke execute on function public.truco_validate_team_membership() from public, anon, authenticated, service_role;
revoke execute on function public.truco_guard_team_group_change() from public, anon, authenticated, service_role;
revoke execute on function public.truco_sync_membership_group() from public, anon, authenticated, service_role;
revoke execute on function public.truco_validate_group_match() from public, anon, authenticated, service_role;
revoke all on function public.truco_rpc_save_team_participation(uuid, uuid, text, uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.truco_rpc_save_team_participation(uuid, uuid, text, uuid, uuid, uuid, integer) to service_role;

commit;
