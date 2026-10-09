-- HOMOLOGAÇÃO LOCAL — nunca executar no Supabase.
-- Reproduz, num PostgreSQL local descartável, só o que o Truco usa da plataforma Supabase:
-- os papéis da API e auth.users/auth.uid(). Não há contas reais: auth.users recebe apenas
-- identidades fictícias criadas pelo seed.
do $$
begin
  if current_setting('server_version_num')::int < 150000 then raise exception 'PostgreSQL 15+ necessário'; end if;
  if inet_server_addr() is not null and not (inet_server_addr() << '127.0.0.0/8'::inet or inet_server_addr() = '::1'::inet) then
    raise exception 'Homologação local: recusado fora de 127.0.0.1 (servidor %)', inet_server_addr();
  end if;
  if exists (select 1 from pg_namespace where nspname in ('storage', 'realtime', 'supabase_functions', 'vault')) then
    raise exception 'Este banco parece um projeto Supabase real. A homologação local não roda aqui.';
  end if;
end $$;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
-- Identidade de conexão do backend de homologação: como o authenticator do Supabase, não tem
-- privilégio próprio; assume service_role (SET ROLE) em cada conexão.
create role truco_homologacao_runtime login noinherit nosuperuser nocreatedb nocreaterole nobypassrls connection limit 12;
grant service_role to truco_homologacao_runtime;
-- anon/authenticated: só para as leituras que o navegador faria direto no Supabase (RLS real).
grant anon, authenticated to truco_homologacao_runtime;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

-- Marcador conferido pelo backend e pelo reset antes de qualquer escrita.
create schema homologacao;
create table homologacao.ambiente (
  unico boolean primary key default true check (unico),
  nome text not null default 'truco-homologacao-local',
  criado_em timestamptz not null default now()
);
insert into homologacao.ambiente default values;
grant usage on schema homologacao to service_role;
grant select on homologacao.ambiente to service_role;
