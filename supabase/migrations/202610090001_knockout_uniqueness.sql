-- Unicidade do mata-mata — segunda camada de proteção do avanço automático do campeonato.
--
-- ESTADO: ESCRITA, NÃO APLICADA. Aplicar só com aprovação explícita do dono do projeto.
--
-- Para que serve
--   O backend processa os lançamentos de placar em fila (um por vez por campeonato), então
--   UMA instância não gera chaveamento nem jogo de mata-mata em dobro. Essa fila vive na
--   memória do processo: se o backend rodar em mais de uma instância (ou reiniciar no meio de
--   uma gravação e duas requisições se cruzarem), só o banco consegue recusar a duplicidade.
--   Estas três restrições fazem isso. O backend já trata a recusa (erro 23505): relê o estado
--   e segue — ver syncKnockout em backend/src/services/bracketService.ts.
--
--   1. truco_bracket_matches: um único confronto por (edição, fase, ordem)
--      → no máximo 7 confrontos por edição, nunca dois "Repescagem 1".
--   2. truco_bracket_matches: um jogo vinculado a no máximo um confronto.
--   3. truco_matches: um único jogo de mata-mata por (edição, fase, ordem)
--      → nunca dois jogos para o mesmo confronto. Não toca nos jogos da fase de grupos.
--
-- O que NÃO faz
--   Não cria, apaga nem altera nenhuma linha. Não mexe em jogos de grupo, placares, duplas,
--   participações, contas, Hall da Fama nem em objetos de outros aplicativos do projeto.
--   Não cria RPC: as regras do campeonato ficam só em shared/src; o banco apenas recusa
--   duplicidade. truco_history já tem UNIQUE (edition) no banco real (lido em 09/10/2026), o
--   que garante uma linha de campeão por edição; por isso não há índice novo para ela aqui.
--
-- O código depende desta migração?
--   Não para funcionar: com uma única instância do backend a fila do processo basta e todos os
--   testes passam com e sem estas restrições. Depende dela para ficar protegido com mais de
--   uma instância. Sem ela, um chaveamento duplicado ainda sem placar é desfeito e refeito
--   sozinho pela sincronização; com placar, o sistema para e relata a anomalia.
--
-- Conferir no banco real ANTES de aplicar (somente leitura):
--   a) Projeto certo (sfllpogpuqukhjddwiel) e histórico remoto de migrações.
--   b) As três consultas de duplicidade abaixo devolvem zero linhas. A migração confere de
--      novo e para com erro, sem gravar nada, se alguma devolver linha. Retrato de 09/10/2026:
--      nenhum confronto de mata-mata na 5ª edição.
--        select truco_championship_id, round, match_order, count(*) from public.truco_bracket_matches
--          group by 1, 2, 3 having count(*) > 1;
--        select truco_match_id, count(*) from public.truco_bracket_matches
--          where truco_match_id is not null group by 1 having count(*) > 1;
--        select truco_championship_id, round, match_order, count(*) from public.truco_matches
--          where stage = 'mata-mata' group by 1, 2, 3 having count(*) > 1;
--   c) Edições antigas (1 a 4): se tiverem jogos de mata-mata gravados com outra convenção de
--      `round`/`match_order`, a consulta acima acusa. Nesse caso NÃO aplicar: decidir antes se a
--      restrição 3 deve valer só para a edição em andamento.
--   d) `round` dos jogos de mata-mata gravados pelo backend: 'Repescagem', 'Quartas de final',
--      'Semifinal', 'Final', com match_order 0 ou 1. A restrição 3 depende dessa convenção.
--   e) A chave estrangeira truco_bracket_matches.truco_match_id → truco_matches precisa ser
--      ON DELETE SET NULL (o backend apaga jogo pendente de quartas contando com isso):
--        select confdeltype from pg_constraint
--          where conrelid = 'public.truco_bracket_matches'::regclass and contype = 'f'
--            and confrelid = 'public.truco_matches'::regclass;   -- esperado: 'n'
--
-- Depois de aplicar: conferir os três índices em pg_indexes e fazer uma leitura de
-- GET /api/bracket. Para desfazer: drop index dos três nomes abaixo.
--
-- Validação feita: sintaxe e comportamento em um PostgreSQL 17 local descartável com tabelas
-- mínimas de mesmo nome e colunas (não é cópia do banco real: sem RLS, gatilhos ou dados).

begin;

do $$
begin
  if exists (
    select 1 from public.truco_bracket_matches
      group by truco_championship_id, round, match_order having count(*) > 1
  ) then
    raise exception 'Há confrontos repetidos em truco_bracket_matches (mesma edição, fase e ordem). Nada foi alterado: resolva a duplicidade antes de aplicar.';
  end if;
  if exists (
    select 1 from public.truco_bracket_matches
      where truco_match_id is not null group by truco_match_id having count(*) > 1
  ) then
    raise exception 'Há um jogo vinculado a mais de um confronto em truco_bracket_matches. Nada foi alterado: resolva antes de aplicar.';
  end if;
  if exists (
    select 1 from public.truco_matches
      where stage = 'mata-mata' group by truco_championship_id, round, match_order having count(*) > 1
  ) then
    raise exception 'Há jogos de mata-mata repetidos em truco_matches (mesma edição, fase e ordem). Nada foi alterado: resolva antes de aplicar.';
  end if;
end $$;

create unique index if not exists truco_bracket_matches_slot_unique
  on public.truco_bracket_matches (truco_championship_id, round, match_order);

create unique index if not exists truco_bracket_matches_match_unique
  on public.truco_bracket_matches (truco_match_id)
  where truco_match_id is not null;

create unique index if not exists truco_matches_knockout_slot_unique
  on public.truco_matches (truco_championship_id, round, match_order)
  where stage = 'mata-mata';

comment on index public.truco_bracket_matches_slot_unique is
  'Um confronto de mata-mata por edição, fase e ordem (no máximo 7 por edição).';
comment on index public.truco_bracket_matches_match_unique is
  'Um jogo pertence a no máximo um confronto do chaveamento.';
comment on index public.truco_matches_knockout_slot_unique is
  'Um jogo de mata-mata por edição, fase e ordem; não se aplica à fase de grupos.';

commit;
