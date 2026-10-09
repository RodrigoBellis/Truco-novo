-- Somente leitura. Não cria schema, roles, contas ou dados.
-- Executar no projeto sfllpogpuqukhjddwiel, após conferir a referência no painel.
-- Não serve como aprovação do isolamento: corpos SQL e privilégios efetivos exigem revisão.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '8s';

SELECT current_database() AS database_name, current_user AS inspector,
       EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'homologacao') AS homologacao_exists;

SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
       coalesce(c.relacl::text, 'default') AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'truco_%' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

SELECT t.tgname, pg_get_triggerdef(t.oid) AS definition,
       fn.nspname AS function_schema, p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace fn ON fn.oid = p.pronamespace
WHERE NOT t.tgisinternal AND n.nspname = 'auth' AND c.relname = 'users'
ORDER BY t.tgname;

SELECT pg_get_functiondef(p.oid) AS truco_auth_trigger_definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'truco_fn_handle_new_user';

SELECT c.relname AS source_table, con.conname,
       rn.nspname AS referenced_schema, rc.relname AS referenced_table
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_class rc ON rc.oid = con.confrelid
JOIN pg_namespace rn ON rn.oid = rc.relnamespace
WHERE con.contype = 'f' AND n.nspname IN ('public', 'homologacao')
  AND c.relname LIKE 'truco_%'
ORDER BY n.nspname, c.relname, con.conname;

SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolinherit
FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role', 'authenticator',
                  'truco_homologacao_runtime')
ORDER BY rolname;

SELECT n.nspname, n.nspacl::text AS schema_acl
FROM pg_namespace n WHERE n.nspname IN ('public', 'auth', 'homologacao');

SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS return_type, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND has_function_privilege('public', p.oid, 'EXECUTE')
ORDER BY p.proname;

-- TEMPORARY é herdado de PUBLIC mesmo quando o papel tem NOINHERIT.
SELECT has_database_privilege('public', current_database(), 'TEMPORARY') AS public_can_create_temp;

-- Combinação que exige reprovar o isolamento antes de criar credenciais ou tabelas.
SELECT n.nspname, p.proname, owner.rolname AS function_owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles owner ON owner.oid = p.proowner
WHERE p.prosecdef AND p.prorettype = 'pg_catalog.trigger'::regtype
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND has_schema_privilege('public', n.oid, 'USAGE')
  AND has_function_privilege('public', p.oid, 'EXECUTE')
  AND has_database_privilege('public', current_database(), 'TEMPORARY')
ORDER BY n.nspname, p.proname;

-- Se o papel já existir, verificar privilégios EFETIVOS sem testar escrita em linhas reais.
SELECT r.rolname, c.relname,
       has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
       has_table_privilege(r.oid, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(r.oid, c.oid, 'UPDATE') AS can_update,
       has_table_privilege(r.oid, c.oid, 'DELETE') AS can_delete,
       has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS can_truncate,
       has_table_privilege(r.oid, c.oid, 'TRIGGER') AS can_create_trigger
FROM pg_roles r CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE r.rolname = 'truco_homologacao_runtime'
  AND n.nspname = 'public' AND c.relname LIKE 'truco_%' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

COMMIT;
