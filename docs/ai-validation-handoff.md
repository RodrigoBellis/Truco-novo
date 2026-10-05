# Contexto para validação da 5ª edição do Truco

Este arquivo registra o escopo, as regras confirmadas e o estado de validação da implementação local, para servir de contexto em uma próxima rodada com a IA de interface/validação.

## Regras confirmadas

- A 5ª edição de 2026 terá 10 duplas: cinco no Grupo A e cinco no Grupo B.
- O administrador forma as duplas manualmente, escolhe os jogadores, o grupo e a força da dupla (1 a 5 estrelas).
- Uma pessoa não pode estar em duas duplas da mesma edição. Pode ter outro parceiro em uma edição futura.
- 1º lugar de cada grupo avança diretamente à semifinal; 2º, 3º e 4º disputam a repescagem; 5º é eliminado.
- A fase de grupos gera 20 partidas de todos contra todos (10 por grupo).
- Resultado melhor de três: vitória 2x0 vale 3 pontos ao vencedor e 0 ao perdedor; vitória 2x1 vale 2 e 1.
- Qualquer integrante pode registrar/corrigir o resultado da própria dupla. O resultado é da partida, com auditoria de usuário e horário.
- Os cruzamentos da repescagem ainda precisam ser definidos pelo administrador. A aplicação não deve presumir essa regra.

## Implementação preparada

- Cadastro e edição manual de duplas por participação na edição, limite de cinco por grupo e força validada entre 1 e 5.
- Classificação com status visual Semifinal, Repescagem e Eliminado.
- Carregamento sob demanda das rotas e telas menos frequentes.
- Autorização no servidor para resultados e rotas administrativas; migration versionada para participações, regras de acesso e auditoria de resultados.
- Configuração Playwright para Chromium desktop e viewport móvel, com fluxos de administrador, jogador, resultados, classificação, Hall da Fama e acesso sem permissão.
- Arquivos `.env.example` contêm somente nomes e placeholders; chaves reais não devem ser adicionadas ao repositório.

## Validação executada

- Typecheck: passou.
- Lint: passou.
- Testes unitários: 20/20 passaram (base anterior: 9).
- Build: passou.
- E2E Playwright: 14/14 passaram em Chromium desktop e viewport móvel. Os cenários usam respostas HTTP simuladas para validar a interface; não são um teste de integração com Supabase.
- Bundle principal: 527,25 kB (149,85 kB gzip) antes; 460,89 kB (134,06 kB gzip) depois.
- Supabase remoto: não validado. A migration ainda não foi aplicada.

## Próximos passos para validação

1. Revisar e aplicar `supabase/migrations/202610050001_manual_edition_participation.sql` em um projeto Supabase de homologação e conferir o backfill antes de produção.
2. Verificar permissões com contas de teste: jogador A não pode alterar partidas da dupla B nem acessar administração; utilizador não autenticado não pode registrar resultados.
3. Conferir os dados reais da 5ª edição e selecionar exatamente cinco duplas aprovadas por grupo antes de gerar os jogos.
4. Validar com contas individuais reais que os dois integrantes veem os mesmos jogos e resultados após atualização.
5. Definir os cruzamentos entre grupos na repescagem antes de liberar a geração do mata-mata.
6. Confirmar configuração de Auth, tabelas, RLS, bucket de avatares e variáveis de ambiente no ambiente de homologação.

## Arquivos e cuidados

- O mapa das operações, ambiente e segurança está em `docs/supabase-security-and-setup.md`.
- A suíte E2E roda com `npm run test:e2e`.
- Não inserir `.env`, tokens, credenciais, exports de sessão ou dados privados nos commits ou relatórios.
- Não houve commit/deploy durante a rodada de implementação; esta nota é preparada como handoff para a próxima revisão.
