-- Cadeado global de resultados da edição.
--
-- Enquanto results_locked = true, jogadores entram e consultam tudo, mas a API recusa criar ou
-- editar placar (administradores continuam podendo). O estado é mudado só pelo backend, com a
-- chave de serviço, a pedido de um administrador (POST /api/admin/results-lock): os papéis do
-- navegador não têm UPDATE nesta tabela.
--
-- O padrão é BLOQUEADO: ao aplicar esta migração, a edição em andamento passa a recusar
-- placares de jogadores até o administrador liberar. Não altera jogos, placares, duplas nem
-- o Hall da Fama. A alteração do estado fica registrada pelo gatilho de auditoria que a
-- tabela já tem.
alter table public.truco_championships
  add column if not exists results_locked boolean not null default true;

comment on column public.truco_championships.results_locked is
  'Cadeado global: true impede jogadores de lançar ou editar resultados nesta edição.';
