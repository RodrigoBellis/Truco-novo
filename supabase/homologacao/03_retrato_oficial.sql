-- HOMOLOGAÇÃO LOCAL — nunca executar no Supabase.
--
-- 1) homologacao.credencial: senha individual por conta, guardada só como hash scrypt
--    (formato "scrypt$sal$hash", em base64url). Sem linha aqui, a conta usa a senha de ensaio
--    fictícia. O login e a troca de senha do modo homologação leem e gravam esta tabela.
--
-- 2) homologacao.retrato_oficial(): recria no banco local o RETRATO DE IDENTIDADES do Supabase
--    oficial, lido em 14/10/2026 só com SELECT (nomes, duplas da 5ª edição, quem tem conta e os
--    títulos). Não copia e-mail, senha, token nem id real: os ids são derivados do nome e os
--    e-mails são fictícios (@retrato.invalid). O estado é o de depois de
--    edition5_reset_competition.sql (sem jogos), ponto de partida da troca de participantes.
--    Serve para ensaiar edition5_replace_participants.sql e o provisionamento de contas
--    exatamente como seriam no oficial.

create table if not exists homologacao.credencial (
  truco_id uuid primary key references auth.users(id) on delete cascade,
  hash text not null,
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on homologacao.credencial to service_role;
-- "Redefinir senha" cria a conta de jogador novo (auth.admin.createUser no lugar do Supabase Auth).
grant insert on auth.users to service_role;

create or replace function homologacao.retrato_oficial() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ed5 uuid := homologacao.id('edicao-5');
  v_pair text[];
  v_team uuid;
  v_name text;
  -- [jogador 1, jogador 2, grupo, cabeça de chave] — as 10 duplas de teste da 5ª edição no oficial.
  v_duplas text[][] := array[
    ['Bagriel', 'Diguinho', 'A', 'true'], ['Bitula', 'Galão', 'A', 'false'], ['PG', 'Caio', 'A', 'false'],
    ['Vito', 'Luizão', 'A', 'false'], ['Xablauu', 'Alexandre', 'A', 'false'], ['JP', 'Davi', 'B', 'false'],
    ['Rafael', 'Pigas', 'B', 'false'], ['Rogério', 'Waguinho', 'B', 'false'], ['Ronaldo', 'Rodrigo', 'B', 'true'],
    ['Vitor', 'Fernando', 'B', 'false']
  ];
  v_slug text;
begin
  if not exists (select 1 from homologacao.ambiente where nome = 'truco-homologacao-local') then
    raise exception 'Marcador de homologação ausente: retrato recusado.';
  end if;
  if inet_server_addr() is not null and not (inet_server_addr() << '127.0.0.0/8'::inet or inet_server_addr() = '::1'::inet) then
    raise exception 'Retrato recusado fora de 127.0.0.1.';
  end if;

  truncate public.truco_bracket_matches, public.truco_matches, public.truco_standings_overrides, public.truco_history,
    public.truco_team_memberships, public.truco_team_members, public.truco_profiles, public.truco_teams, public.truco_groups,
    public.truco_audit_log, public.truco_championships, public.truco_players, auth.users, homologacao.credencial cascade;

  insert into public.truco_championships (truco_id, name, edition, year, status, current_phase, draw_status)
  select homologacao.id('edicao-' || n), n || 'ª Edição', n, 2021 + n,
    (case when n = 5 then 'em_andamento' else 'encerrado' end)::public.truco_championship_status,
    case when n = 5 then 'Fase de Grupos' else 'Campeonato Finalizado' end, 'realizado'
  from generate_series(1, 5) n;
  -- O oficial ainda tem os dois grupos do formato antigo.
  insert into public.truco_groups (truco_id, truco_championship_id, label, name)
  select homologacao.id('grupo-' || lower(g)), v_ed5, g, 'Grupo ' || g from unnest(array['A', 'B']) g;

  -- 21 jogadores + administrador, como no oficial. Vinícius (campeão da 3ª) não tem conta.
  foreach v_name in array array['Alexandre', 'Bagriel', 'Bitula', 'Caio', 'Davi', 'Diguinho', 'Fernando', 'Galão', 'JP', 'Luizão',
    'PG', 'Pigas', 'Rafael', 'Rodrigo', 'Rogério', 'Ronaldo', 'Vinícius', 'Vito', 'Vitor', 'Waguinho', 'Xablauu'] loop
    insert into public.truco_players (truco_id, name) values (homologacao.id('real-' || v_name), v_name);
    if v_name <> 'Vinícius' then
      v_slug := lower(translate(v_name, 'áãâéêíóõôúçÁÃÂÉÊÍÓÕÔÚÇ', 'aaaeeiooouc' || 'aaaeeiooouc'));
      insert into auth.users (id, email) values (homologacao.id('conta-real-' || v_name), v_slug || '@retrato.invalid');
      insert into public.truco_profiles (truco_id, truco_player_id, email, role, must_change_password)
      values (homologacao.id('conta-real-' || v_name), homologacao.id('real-' || v_name), v_slug || '@retrato.invalid', 'jogador', false);
    end if;
  end loop;
  insert into public.truco_players (truco_id, name) values (homologacao.id('admin'), 'Administrador');
  insert into auth.users (id, email) values (homologacao.id('conta-admin'), 'admin@trucodonovo.com');
  insert into public.truco_profiles (truco_id, truco_player_id, email, role, must_change_password)
  values (homologacao.id('conta-admin'), homologacao.id('admin'), 'admin@trucodonovo.com', 'superadmin', false);

  -- As 10 duplas aprovadas em A/B são anteriores à migration 202610140001 (grupo único de 7):
  -- o gatilho de capacidade é desligado só durante a montagem do retrato.
  alter table public.truco_teams disable trigger truco_teams_manual_edition_capacity;
  foreach v_pair slice 1 in array v_duplas loop
    v_team := homologacao.id('real-dupla-' || v_pair[1] || '-' || v_pair[2]);
    insert into public.truco_teams (truco_id, truco_championship_id, truco_group_id, name, status, seeded)
    values (v_team, v_ed5, homologacao.id('grupo-' || lower(v_pair[3])), v_pair[1] || ' & ' || v_pair[2], 'aprovada', v_pair[4]::boolean);
    insert into public.truco_team_memberships (truco_championship_id, truco_team_id, truco_player_1_id, truco_player_2_id, truco_group_id, strength)
    values (v_ed5, v_team, homologacao.id('real-' || v_pair[1]), homologacao.id('real-' || v_pair[2]), homologacao.id('grupo-' || lower(v_pair[3])), 3);
  end loop;
  alter table public.truco_teams enable trigger truco_teams_manual_edition_capacity;

  -- Campeã da 3ª edição (Bitula & Vinícius): dupla só do histórico.
  insert into public.truco_teams (truco_id, truco_championship_id, name, status)
  values (homologacao.id('real-dupla-Bitula-Vinícius'), homologacao.id('edicao-3'), 'Bitula & Vinícius', 'pendente');

  -- Pares históricos das três duplas campeãs.
  insert into public.truco_team_members (truco_team_id, truco_player_id, position) values
    (homologacao.id('real-dupla-Bagriel-Diguinho'), homologacao.id('real-Bagriel'), 1), (homologacao.id('real-dupla-Bagriel-Diguinho'), homologacao.id('real-Diguinho'), 2),
    (homologacao.id('real-dupla-Bitula-Vinícius'), homologacao.id('real-Bitula'), 1), (homologacao.id('real-dupla-Bitula-Vinícius'), homologacao.id('real-Vinícius'), 2),
    (homologacao.id('real-dupla-Ronaldo-Rodrigo'), homologacao.id('real-Ronaldo'), 1), (homologacao.id('real-dupla-Ronaldo-Rodrigo'), homologacao.id('real-Rodrigo'), 2);

  insert into public.truco_history (truco_id, truco_championship_id, edition, name, year, champion_team_id, notes)
  values
    (homologacao.id('historico-1'), homologacao.id('edicao-1'), 1, '1ª Edição', 2022, homologacao.id('real-dupla-Bagriel-Diguinho'), 'Retrato do oficial.'),
    (homologacao.id('historico-2'), homologacao.id('edicao-2'), 2, '2ª Edição', 2023, homologacao.id('real-dupla-Bagriel-Diguinho'), 'Retrato do oficial.'),
    (homologacao.id('historico-3'), homologacao.id('edicao-3'), 3, '3ª Edição', 2024, homologacao.id('real-dupla-Bitula-Vinícius'), 'Retrato do oficial.'),
    (homologacao.id('historico-4'), homologacao.id('edicao-4'), 4, '4ª Edição', 2025, homologacao.id('real-dupla-Ronaldo-Rodrigo'), 'Retrato do oficial.');
end $$;

revoke all on function homologacao.retrato_oficial() from public;
grant execute on function homologacao.retrato_oficial() to service_role;
