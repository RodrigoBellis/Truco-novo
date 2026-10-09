import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

if (process.argv[2] === '--isolation-boundary') {
  await import('./test-homologacao-isolation.mjs');
  process.exit(0);
}

// Usa somente os binários já instalados. Nunca lê .env nem conecta a um Supabase.
const root = resolve(import.meta.dirname, '../..');
const bin = process.env.TRUCO_POSTGRES_BIN ?? 'C:/Program Files/PostgreSQL/17/bin';
const cluster = join(root, 'test-results', `postgres-review-${Date.now()}`);
mkdirSync(cluster, { recursive: true });
const exe = name => join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const run = (name, args) => {
  const result = spawnSync(exe(name), args, { encoding: 'utf8', windowsHide: true, ...(name === 'pg_ctl' ? { stdio: 'ignore' } : {}) });
  if (result.status !== 0) throw new Error(`${name}: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
};
const port = '55439';
if (process.argv[2] === '--stop-cluster') {
  const target = resolve(root, 'test-results', process.argv[3] ?? '');
  assert.match(process.argv[3] ?? '', /^postgres-review-\d+$/);
  assert.equal(target, join(root, 'test-results', process.argv[3]));
  run('pg_ctl', ['-D', target, '-m', 'fast', '-w', 'stop']);
  process.exit(0);
}
const args = ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'review_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = text => run('psql', [...args, '-c', text]).trim();
const c = '00000000-0000-4000-8000-000000000005';
const match = '00000000-0000-4000-8000-000000000031';
const actor = '00000000-0000-4000-8000-000000000001';
const revision = () => Number(sql(`select progression_revision from public.truco_championships where truco_id='${c}'`));
const score = (rev, who = actor, a = 2, b = 0) => `set role service_role; select public.truco_rpc_record_match_result_v2('${c}','${match}',${a},${b},'${who}',${rev});`;
const asyncSql = text => new Promise(resolveResult => {
  const child = spawn(exe('psql'), [...args, '-c', text], { windowsHide: true });
  let output = ''; child.stderr.on('data', chunk => { output += chunk; });
  child.on('exit', status => resolveResult({ status, output }));
  child.on('error', error => resolveResult({ status: -1, output: error.message }));
});
let started = false;
try {
  run('initdb', ['-D', cluster, '-U', 'review_test', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', cluster, '-l', join(cluster, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
  started = true;
  for (const file of ['supabase/tests/knockout_transaction_fixture.sql', 'supabase/migrations/202610090001_knockout_uniqueness.sql', 'supabase/migrations/202610090002_transactional_progression.sql']) run('psql', [...args, '-f', join(root, file)]);
  const before = sql('select edition,name,notes from public.truco_history order by edition');
  assert.throws(() => sql(score(revision(), '00000000-0000-4000-8000-000000000002')), /Jogador fora/);
  sql(`update public.truco_championships set results_locked=true where truco_id='${c}'`);
  assert.throws(() => sql(score(revision())), /Resultados bloqueados/);
  sql(`update public.truco_championships set results_locked=false where truco_id='${c}'`);
  const rev = revision();
  const concurrent = await Promise.all([asyncSql(score(rev, actor, 2, 0)), asyncSql(score(rev, actor, 2, 1))]);
  assert.deepEqual(concurrent.map(result => result.status).sort(), [0, 1]);
  assert.match(concurrent.find(result => result.status !== 0).output, /Estado do campeonato mudou/);
  assert.equal(sql('select count(*) from public.truco_audit_log'), '1');
  const [a,b] = sql(`select sets_a,sets_b from public.truco_matches where truco_id='${match}'`).split('|').map(Number);
  sql(score(revision(), actor, a, b));
  assert.equal(sql('select count(*) from public.truco_audit_log'), '1');
  assert.throws(() => sql(score(rev)), /Estado do campeonato mudou/);
  console.log('PASS: ownership, cadeado, revisão, concorrência real entre duas conexões, auditoria idempotente');
  // Plano com insert seguido de erro: o insert inteiro deve ser revertido.
  const row = { id: '00000000-0000-4000-8000-000000000041', round: 'repescagem', label: 'R1', order: 0, slotA: { type: 'direct', teamId: '00000000-0000-4000-8000-000000000021' }, slotB: { type: 'direct', teamId: '00000000-0000-4000-8000-000000000022' } };
  const apply = steps => `set role service_role; select public.truco_rpc_apply_knockout_plan('${c}',${revision()},'${JSON.stringify(steps)}'::jsonb);`;
  assert.throws(() => sql(apply([{ type:'create-bracket', rows:[row] },{ type:'invalid' }])), /desconhecido/);
  assert.equal(sql('select count(*) from public.truco_bracket_matches'), '0');
  sql(apply([{ type:'create-bracket', rows:[row] }]));
  assert.throws(() => sql(apply([{ type:'create-bracket', rows:[{...row,id:'00000000-0000-4000-8000-000000000042'}] }])), /unique/);
  sql(apply([{ type:'create-match', bracketMatchId: row.id, round:'Repescagem', order:0, teamAId:row.slotA.teamId, teamBId:row.slotB.teamId }]));
  assert.equal(sql(`select count(*) from public.truco_matches m join public.truco_bracket_matches b on b.truco_match_id=m.truco_id where b.truco_id='${row.id}'`), '1');
  const pendingBefore = sql('select truco_id from public.truco_matches order by truco_id');
  assert.throws(() => sql(apply([{type:'clear-knockout'},{type:'invalid'}])), /desconhecido/);
  assert.equal(sql('select truco_id from public.truco_matches order by truco_id'), pendingBefore);
  assert.equal(sql('select count(*) from public.truco_bracket_matches'), '1');
  const pendingMatch = sql(`select truco_match_id from public.truco_bracket_matches where truco_id='${row.id}'`);
  assert.throws(() => sql(`set role service_role; select public.truco_rpc_record_match_result_v2('${c}','${pendingMatch}',2,0,'${actor}',${revision()})`), /Avanço anterior pendente/);
  sql(apply([]));
  assert.equal(sql(`select progression_pending from public.truco_championships where truco_id='${c}'`), 'f');
  console.log('PASS: rollback integral do plano e unicidade');
  // Final local: histórico por edition (sem presumir championship_id na tabela).
  sql(`insert into public.truco_matches(truco_id,truco_championship_id,stage,round,match_order,truco_team_a_id,truco_team_b_id,status,sets_a,sets_b) values('00000000-0000-4000-8000-000000000032','${c}','mata-mata','Final',0,'00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022','realizado',2,1);
    insert into public.truco_bracket_matches(truco_id,truco_championship_id,round,match_order,truco_match_id) values('00000000-0000-4000-8000-000000000043','${c}','final',0,'00000000-0000-4000-8000-000000000032');`);
  const champion = { type:'record-champion', championTeamId:'00000000-0000-4000-8000-000000000021', runnerUpTeamId:'00000000-0000-4000-8000-000000000022', finalResult:'2x1' };
  sql('alter table public.truco_team_members add constraint injected_pair_failure check(position<2)');
  assert.throws(() => sql(apply([champion,{type:'set-phase',phase:'Campeonato Finalizado'}])), /injected_pair_failure/);
  assert.equal(sql('select count(*) from public.truco_history where edition=5'), '0');
  assert.equal(sql('select count(*) from public.truco_team_members'), '0');
  assert.equal(sql(`select current_phase from public.truco_championships where truco_id='${c}'`), 'Fase de Grupos');
  sql('alter table public.truco_team_members drop constraint injected_pair_failure');
  sql(apply([champion,{type:'set-phase',phase:'Campeonato Finalizado'}]));
  sql(apply([champion]));
  assert.equal(sql('select count(*) from public.truco_history where edition=5'), '1');
  sql(`update public.truco_team_members set truco_player_id='00000000-0000-4000-8000-000000000099' where truco_team_id='${champion.championTeamId}' and position=1`);
  assert.throws(() => sql(apply([champion])), /Par histórico incompatível/);
  sql(`update public.truco_team_members set truco_player_id='00000000-0000-4000-8000-000000000011' where truco_team_id='${champion.championTeamId}' and position=1`);
  assert.equal(sql('select count(*) from public.truco_team_members'), '4');
  assert.equal(sql('select edition,name,notes from public.truco_history where edition=1'), before);
  sql(`alter table public.truco_history add column truco_championship_id uuid;
    update public.truco_history set truco_championship_id=case when edition=5 then '${c}'::uuid else '00000000-0000-4000-8000-000000000099'::uuid end;
    alter table public.truco_history alter column truco_championship_id set not null;`);
  sql(apply([champion]));
  assert.equal(sql('select count(*) from public.truco_history where edition=5'), '1');
  sql("update public.truco_matches set sets_a=0,sets_b=2 where round='Final'");
  sql(apply([{...champion,championTeamId:champion.runnerUpTeamId,runnerUpTeamId:champion.championTeamId,finalResult:'2x0'}]));
  assert.equal(sql('select champion_team_id,final_result from public.truco_history where edition=5'), champion.runnerUpTeamId+'|2x0');
  assert.equal(sql('select count(*) from public.truco_history where edition=5'), '1');
  assert.equal(sql('select edition,name,notes from public.truco_history where edition=1'), before);
  assert.equal(sql(`select has_function_privilege('anon','public.truco_rpc_apply_knockout_plan(uuid,bigint,jsonb)','EXECUTE')`), 'f');
  assert.equal(sql(`select has_function_privilege('authenticated','public.truco_rpc_record_match_result_v2(uuid,uuid,integer,integer,uuid,bigint)','EXECUTE')`), 'f');
  console.log('PASS: campeão automático idempotente, histórico preservado, RPCs restritas');
  console.log('PostgreSQL local com schema mínimo. Não comprova segurança/RLS/gatilhos do Supabase de homologação ou produção.');
} finally {
  if (started) run('pg_ctl', ['-D', cluster, '-m', 'fast', '-w', 'stop']);
}
