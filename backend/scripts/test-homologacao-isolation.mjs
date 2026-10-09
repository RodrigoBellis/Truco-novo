import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Prova exclusivamente LOCAL, em cluster descartável e sem .env/Supabase.
// Reproduz somente o padrão de permissões/função, com tabela artificial.
const root = resolve(import.meta.dirname, '../..');
const bin = process.env.TRUCO_POSTGRES_BIN ?? 'C:/Program Files/PostgreSQL/17/bin';
const cluster = join(root, 'test-results', `postgres-isolation-${Date.now()}`);
mkdirSync(cluster, { recursive: true });
const run = (name, args) => {
  const result = spawnSync(join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`), args,
    { encoding: 'utf8', windowsHide: true, ...(name === 'pg_ctl' ? { stdio: 'ignore' } : {}) });
  if (result.status !== 0) throw new Error(`${name}: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
};
const connection = who => ['-X', '-h', '127.0.0.1', '-p', '55444', '-U', who, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = (who, query) => run('psql', [...connection(who), '-c', query]).trim();
let started = false;
try {
  run('initdb', ['-D', cluster, '-U', 'local_installer', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', cluster, '-l', join(cluster, 'server.log'), '-o', '-h 127.0.0.1 -p 55444', '-w', 'start']);
  started = true;
  sql('local_installer', `
    create role local_definer nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
    create role local_runtime login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
    revoke create on schema public from public;
    grant usage on schema public to public;
    create table public.official_mock(marker text);
    alter table public.official_mock owner to local_definer;
    revoke all on public.official_mock from public;
    create function public.email_mock() returns text language sql stable as $$ select ''::text $$;
    create function public.stamp_mock() returns trigger language plpgsql security definer
      set search_path = public as $$ begin new.autor_email := public.email_mock(); return new; end $$;
    alter function public.stamp_mock() owner to local_definer;
    grant execute on function public.stamp_mock() to public;
  `);
  assert.equal(sql('local_installer', "select rolsuper from pg_roles where rolname='local_definer'"), 'f');
  assert.equal(sql('local_runtime', 'select current_user'), 'local_runtime');
  assert.equal(sql('local_runtime', "select has_table_privilege(current_user,'public.official_mock','SELECT,INSERT,UPDATE,DELETE')"), 'f');
  assert.throws(() => sql('local_runtime', 'select * from public.official_mock'), /permission denied/);
  assert.throws(() => sql('local_runtime', "insert into public.official_mock values('direct')"), /permission denied/);
  assert.throws(() => sql('local_runtime', "update public.official_mock set marker='direct'"), /permission denied/);
  assert.throws(() => sql('local_runtime', 'delete from public.official_mock'), /permission denied/);
  console.log('PASS LOCAL: principal próprio; leitura/escrita diretas recusadas; definer não é superusuário');

  // Não chama RESET ROLE e não depende de sessão administrativa: conexão real de local_runtime.
  sql('local_runtime', `
    create temporary table bootstrap(id integer);
    create function pg_temp.domain_guard(text) returns boolean language plpgsql security invoker as $$
    begin
      if current_user = 'local_definer' then
        insert into public.official_mock values(current_user);
      end if;
      return true;
    end $$;
    create domain pg_temp.author_domain as text check(pg_temp.domain_guard(value));
    create temporary table local_input(autor_email pg_temp.author_domain);
    create trigger local_stamp before insert on local_input for each row execute function public.stamp_mock();
    insert into local_input values(null);
  `);
  assert.equal(sql('local_installer', 'select count(*) from public.official_mock'), '1');
  assert.equal(sql('local_installer', 'select marker from public.official_mock'), 'local_definer');
  console.log('CONFIRMED LOCAL: domínio avaliado dentro do trigger escreveu na tabela protegida com identidade do definer');

  assert.throws(() => run('psql', [...connection('local_installer'), '-f', join(root, 'supabase/migrations/202610090003_homologacao_runtime_role.sql')]), /Isolamento reprovado/);
  assert.equal(sql('local_installer', "select count(*) from pg_roles where rolname='truco_homologacao_runtime'"), '0');
  console.log('PASS LOCAL: migration de homologação recusou o ambiente inseguro antes de criar o papel');

  // Mitigação verificada SOMENTE no mock local. Não autoriza mudança no Supabase compartilhado.
  sql('local_installer', 'revoke execute on function public.stamp_mock() from public');
  assert.throws(() => sql('local_runtime', `
    create temporary table local_input(autor_email text);
    create trigger local_stamp before insert on local_input for each row execute function public.stamp_mock();
  `), /permission denied for function (?:public\.)?stamp_mock/);
  assert.equal(sql('local_installer', 'select count(*) from public.official_mock'), '1');
  console.log('PASS LOCAL: revogação do EXECUTE público bloqueou a criação do trigger indireto');
} finally {
  if (started) run('pg_ctl', ['-D', cluster, '-m', 'fast', '-w', 'stop']);
}
