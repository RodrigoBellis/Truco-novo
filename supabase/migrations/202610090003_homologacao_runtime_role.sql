-- PREPARADA, NÃO APLICADA. Somente papel novo, nenhuma alteração em objetos oficiais.
-- CLI não disponível; arquivo versionado preparado manualmente sem instalação.
-- Esta migration deve RECUSAR o projeto atual enquanto existir o caminho indireto
-- SECURITY DEFINER público + objetos temporários. Não desativar a checagem.
-- Mesmo passando, exige auditoria completa das demais rotinas acessíveis antes de LOGIN.
begin;

do $guard$
declare vulnerable_trigger text;
begin
  if exists (select 1 from pg_roles where rolname = 'truco_homologacao_runtime') then
    raise exception 'O papel já existe: auditar sua identidade antes de continuar';
  end if;

  select format('%I.%I(%s)', n.nspname, p.proname,
                pg_get_function_identity_arguments(p.oid))
    into vulnerable_trigger
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and p.prorettype = 'pg_catalog.trigger'::regtype
    and n.nspname not in ('pg_catalog', 'information_schema')
    and has_schema_privilege('public', n.oid, 'USAGE')
    and has_function_privilege('public', p.oid, 'EXECUTE')
  order by n.nspname, p.proname limit 1;

  if vulnerable_trigger is not null
     and has_database_privilege('public', current_database(), 'TEMPORARY') then
    raise exception using errcode = '42501',
      message = 'Isolamento reprovado: trigger SECURITY DEFINER acessível por PUBLIC e permissão TEMPORARY',
      detail = vulnerable_trigger,
      hint = 'Interromper. Não modificar grants oficiais sem autorização específica.';
  end if;
end
$guard$;

-- NOLOGIN até concluir a auditoria de privilégios efetivos e preparar conexão segura.
-- Nenhuma senha ou credencial é incluída nesta migration.
create role truco_homologacao_runtime
  nologin nosuperuser nocreatedb nocreaterole noinherit
  noreplication nobypassrls connection limit 2;

commit;
