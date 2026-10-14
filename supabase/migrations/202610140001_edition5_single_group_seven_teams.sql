-- 5ª edição, formato definitivo de 14/10/2026: sete duplas num grupo único e disputa de 3º lugar.
--
-- ESTADO: ESCRITA E VALIDADA SÓ NA HOMOLOGAÇÃO LOCAL. NÃO aplicar no Supabase oficial sem
-- autorização explícita. Depende de 202610070001 (helper de capacidade) e 202610090002 (RPCs).
--
-- O que muda
--   1. truco_fn_teams_per_group passa a 7 e o limite da 5ª edição passa a 7 duplas aprovadas,
--      todas no mesmo grupo (o grupo "A", mostrado como "Grupo Único").
--   2. truco_bracket_round ganha 'terceiro' (disputa de 3º lugar).
--   3. truco_bracket_slot_type ganha 'loser': a disputa de 3º recebe os perdedores das semifinais.
--
-- O que NÃO faz: não cria, apaga nem altera duplas, jogadores, participações, partidas,
-- placares, contas nem o Hall da Fama. As fases antigas do enum ('oitavas') continuam existindo.
--
-- ALTER TYPE ... ADD VALUE não pode ser usado na mesma transação em que é criado; nada aqui usa
-- os valores novos, só o backend depois do commit.

begin;

create or replace function public.truco_fn_teams_per_group()
returns integer
language sql
immutable
set search_path = ''
as $$ select 7 $$;

-- Limite da 5ª edição: 7 duplas aprovadas, todas no mesmo grupo.
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
  v_other_group integer;
begin
  select edition into v_edition from public.truco_championships where truco_id = new.truco_championship_id;
  if v_edition is distinct from 5 or new.status <> 'aprovada' then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.truco_championship_id::text, 0));
  select count(*) into v_count from public.truco_teams
    where truco_championship_id = new.truco_championship_id and status = 'aprovada' and truco_id <> new.truco_id;
  if v_count >= v_per_group then
    raise exception 'A 5ª edição aceita % duplas aprovadas', v_per_group;
  end if;

  select count(*) into v_other_group from public.truco_teams
    where truco_championship_id = new.truco_championship_id and status = 'aprovada'
      and truco_group_id is distinct from new.truco_group_id and truco_id <> new.truco_id;
  if v_other_group > 0 then
    raise exception 'A 5ª edição tem um grupo único: todas as duplas aprovadas ficam no mesmo grupo';
  end if;
  return new;
end;
$$;

revoke execute on function public.truco_validate_manual_edition_team_capacity() from public, anon, authenticated, service_role;

alter type public.truco_bracket_round add value if not exists 'terceiro';
alter type public.truco_bracket_slot_type add value if not exists 'loser';

commit;
