-- Criação de senha no primeiro acesso da 5ª edição (decisão de 14/10/2026).
--
-- ESTADO: ESCRITA E VALIDADA SÓ NA HOMOLOGAÇÃO LOCAL. NÃO aplicar no Supabase oficial sem
-- autorização explícita.
--
-- access_setup_required: a conta ainda não criou a senha desta edição. Enquanto estiver ligada,
--   a senha anterior não vale (o backend a troca por uma senha aleatória que ninguém conhece) e o
--   jogador só entra pela tela "Crie sua senha para a 5ª Edição". A criação desliga a coluna num
--   UPDATE condicional (where access_setup_required) — duas pessoas ao mesmo tempo: só uma grava.
-- access_setup_completed_at: quando a senha foi criada (para o administrador acompanhar).
-- sessions_valid_after: sessões autenticadas antes deste instante são recusadas pela API
--   (reinício de acesso, criação de senha). O backend compara com o horário da autenticação
--   registrado no token (claim amr), que se mantém nas renovações da sessão.
--
-- O que NÃO faz: não cria, apaga nem altera contas, jogadores, duplas, resultados ou histórico.
-- Todas as contas começam com access_setup_required = false (nada muda até o reinício do acesso).

begin;

alter table public.truco_profiles
  add column if not exists access_setup_required boolean not null default false,
  add column if not exists access_setup_completed_at timestamptz,
  add column if not exists sessions_valid_after timestamptz;

commit;
