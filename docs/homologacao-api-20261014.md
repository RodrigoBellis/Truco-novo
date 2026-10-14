# Homologação local pela API — 14/10/2026

As 27 partidas foram concluídas no PostgreSQL local, usando os 14 participantes oficiais em uma cópia de homologação. A lógica de classificação e progressão passou nos cenários executados. A interface e o Supabase Auth real não estão homologados por estes resultados. Existem pendências de concorrência/recuperação de acesso identificadas por revisão de código.

## Escopo e auditoria inicial

Antes de editar arquivos, foram consultados `git status --short`, `git diff --stat`, diferenças de código, arquivos não rastreados e documentação de homologação/implantação. O estado inicial continha 83 arquivos rastreados modificados (2.905 inserções/2.377 remoções) e 11 não rastreados. Não é possível atribuir autoria individual só pelo Git; esse conjunto foi tratado como o trabalho herdado do Claude e preservado. Nenhuma alteração foi descartada.

Documentos consultados: `DESIGN.md`, `docs/frontend-redesign-5th-edition.md`, `docs/homologacao-local-20261009.md`, `docs/plano-producao-5a-edicao.md`, `docs/implantacao-5a-edicao.md` e `docs/supabase-security-and-setup.md`.

Os resultados registrados em 09/10 eram de uma versão anterior (10 duplas, dois grupos). Não validavam o estado atual. O arquivo `.last-run.json` herdado da homologação indicava falha, com capturas de primeiro acesso mobile; não foi usado como evidência de aprovação da versão atual.

O Claude deixou implementados: grupo único de sete duplas; geração dos 21 confrontos; progressão automática de seis jogos eliminatórios com terceiro lugar; tela Jogos com Meus Jogos/Todas as Rodadas/Mata-mata, progresso, mesas de referência, descansos e classificação; criação individual de senha e administração de acessos; migrations locais pendentes; adaptações de simuladores e testes. A documentação visual antiga ainda contém descrições do formato anterior: a instrução atual do usuário prevalece.

## Ambiente e segurança

- Disco C: inicialmente aproximadamente 557 MiB livres; cluster existente aproximadamente 65 MiB. A última leitura foi aproximadamente 1.092 MiB livres. Nenhuma limpeza foi executada por este trabalho.
- PostgreSQL 17.10 já ativo em `127.0.0.1:55450`, banco `truco_homologacao`; marcador `truco-homologacao-local` verificado.
- Dois backends em modo homologação nas portas 3101/3102, sem leitura do `.env` oficial. Foram encerrados após as verificações; o PostgreSQL preexistente foi preservado.
- Nenhuma instalação, migration remota, acesso ao Supabase oficial, redefinição de senha real, commit, push ou deploy.
- Testes e senhas fictícias somente locais. Senhas individuais sorteadas em memória; o banco local armazena hashes. Nenhuma sessão foi salva em arquivos deste relatório/roteiro.
- Um comando Playwright havia sido iniciado antes da instrução posterior para usar somente API. Quando essa instrução chegou, a sessão já não estava disponível e não havia frontend/backend de teste escutando. Não há resultado completo recuperado desse comando; ele não conta como validação. Nenhum novo teste de navegador foi executado após a mudança de escopo, nem foi feita limpeza dos artefatos anteriores.

## Resultados executados

| Verificação | Resultado | Evidência e limite |
| --- | --- | --- |
| Participantes, senhas e permissões oficiais locais | PASSOU | `homologacao-participantes.mjs --api http://127.0.0.1:3101`: 36 verificações |
| Campeonato em duas instâncias | PASSOU | `homologacao-campeonato-api.mjs 20261014 --text-only`: 66 verificações; 27 resultados no banco |
| Empate absoluto e sua resolução | PASSOU | `montar`, `decidir`, `montar`, `corrigir`: 5 + 7 + 5 + 2 verificações |
| Campeonato completo com nomes oficiais locais | PASSOU | `homologacao-oficial-api.mjs`: 13 verificações agregadas; 27 primeiros placares pela API; repetição final também passou |
| Classificação a cada placar/correção | PASSOU | Cálculo independente de pontos, vitórias, 2x0, saldo, jogos e ordem; 21 lançamentos e nove correções no roteiro oficial |
| Distribuição de rodadas pelo código | PASSOU | Mesmo `buildGroupRounds` utilizado pela tela: 7 rodadas, 3 jogos/mesas, 21 pares únicos, sem dupla repetida em uma rodada, cada dupla descansa uma vez |
| Typecheck dos três workspaces e lint | PASSOU | Verificados; typecheck backend e lint repetidos após ajuste do reset local |
| Testes do backend | PASSOU | 123 testes, zero falhas, zero ignorados; inclui logins sequenciais/concurrentes e regras de rodadas |
| Build de shared e sintaxe dos roteiros modificados | PASSOU | `tsc` de shared e `node --check` |
| Build completo final de backend/frontend | NÃO TESTADO | Não há confirmação completa do comando inicial interrompido; não confundir com typecheck |
| Desktop, celular e botões reais | NÃO TESTADO | Validação atual restrita à API/SQL; geometria das rodadas não comprova a renderização |
| Supabase Auth/PostgREST/Realtime/Storage reais | NÃO TESTADO | A homologação usa shim SQL e autenticação fictícia |
| Falhas concorrentes de acesso apontadas na revisão | NÃO TESTADO | Inspeção de código; sem reprodução por falha injetada |

### Os 14 participantes

| Dupla | Jogadores |
| --- | --- |
| Pigas & Diguinho | Pigas, Diguinho |
| Ronaldo & Rodrigo | Ronaldo, Rodrigo |
| JP & Anderson | JP, Anderson |
| Saulo & Vitor | Saulo, Vitor |
| PG & Alexandre | PG, Alexandre |
| Rogério & Waguinho | Rogério, Waguinho |
| Digão & Rafinha | Digão, Rafinha |

Foram verificados vínculos, força e grupo; identidade de Digão distinta de Diguinho; Rafinha preservando o id do antigo Rafael; 11 contas existentes e três criadas localmente. As quatro edições e seus pares históricos foram preservados, incluindo Bagriel & Diguinho nas edições 1/2, Bitula & Vinícius na 3 e Ronaldo & Rodrigo na 4.

O roteiro de acesso comprovou: cadastro simultâneo dos 14, senhas antigas recusadas, sessões antigas/renovadas recusadas após redefinição, outras 13 sessões preservadas, dupla tentativa concorrente de cadastro com um único sucesso, senha curta recusada, limite 429, auditoria sem senhas e permissões 401/403. Esses são resultados de autenticação fictícia local, não do Supabase Auth real.

### Campeonato e classificação

Ordem das rodadas no roteiro oficial: **7, 1, 7, 6, 2, 4, 4, 3, 6, 1, 1, 5, 7, 5, 2, 6, 5, 4, 3, 3, 2**. O primeiro resultado pertenceu à Rodada 7, antes de qualquer resultado da Rodada 1. Houve nove correções em três confrontos, incluindo mudança de vencedor e restauração; a classificação foi conferida após cada gravação.

Com 20 resultados não havia mata-mata. Após o 21º surgiram automaticamente as quartas 3º×6º e 4º×5º; as semifinais respeitaram 1º×vencedor Q2 e 2º×vencedor Q1. Final e terceiro lugar surgiram após as semifinais. Não houve geração manual de fases. As quartas, semifinais e os dois últimos jogos foram enviados em pares concorrentes no roteiro oficial, com reenvio quando necessário.

Pódio **simulado, exclusivamente local**: campeão **Pigas & Diguinho**, vice **Ronaldo & Rodrigo**, terceiro **JP & Anderson**. Campeão e vice persistem em `truco_history`; o terceiro é derivado do placar persistido da disputa de terceiro lugar, sem coluna nova no histórico.

Leitura SQL final: 21 jogos de grupo, duas quartas, duas semifinais, uma final e uma disputa de terceiro, todos com placar; fase `Campeonato Finalizado`, `progression_pending=false`. Sem duplicidades ou anomalias pela API. O hash integral das linhas de histórico das edições 1–4 permaneceu idêntico entre início/fim do roteiro oficial.

Não existe bloqueio por sequência, rodada ou ocupação de mesas. As correções têm limites esportivos já existentes: após um placar de mata-mata, o grupo não pode ser corrigido; trocar vencedor de um jogo anterior é recusado se a fase dependente já tiver placar; jogadores não podem corrigir após encerrar a edição. Esses limites foram testados e distinguem integridade do chaveamento de ordem obrigatória de jogos.

### Concorrência e falhas

O roteiro de duas instâncias testou quatro lançamentos simultâneos do mesmo confronto, reenvios idênticos sem auditoria duplicada, o 21º resultado concorrente, quartas concorrentes, correções que refazem o chaveamento e propagam vencedor/perdedor, final/terceiro concorrentes e estado final estável.

Uma semifinal foi gravada diretamente pela RPC local para simular perda do processo entre placar e avanço. O pedido seguinte foi recusado enquanto pendente e o worker reconciliou sem reenvio. Por isso esse primeiro roteiro comprova 27 resultados com uso combinado de API/RPC. O roteiro oficial adicional comprova todas as 27 primeiras gravações pela API.

Oito conexões locais do backend foram derrubadas com `pg_terminate_backend`; seis leituras seguintes responderam 200 e o banco continuou coerente. Não houve resposta 503 observada nesse cenário; o teste comprova recuperação, não a renderização de mensagens de erro. Não foi simulado encerramento real do processo nem perda do disco.

## Falha encontrada e mudanças desta sessão

Uma repetição do teste de primeiro acesso FALHOU inicialmente com 429 porque o reset do banco não zerava o limitador em memória. Foi corrigida a rota **exclusiva de homologação** para chamar `resetAccessRateLimits()` junto ao reset. Uma segunda tentativa do roteiro novo repetia o teste de limite antes de recriar as senhas e também encontrou 429; o roteiro foi ajustado para separar a preparação SQL do teste completo de acesso. O limitador da aplicação continua intacto. As execuções finais passaram.

Arquivos escritos por Codex:

- `backend/src/routes/homologationRoutes.ts`: reset do limitador só na homologação.
- `backend/scripts/homologacao-campeonato-api.mjs`: opção `--text-only`, comprovação das rodadas, Rodada 7 primeiro e comparação de estatísticas além da ordem da classificação.
- `backend/scripts/homologacao-oficial-api.mjs`: novo roteiro repetível de 27 placares pela API com participantes oficiais na cópia local, nove correções e verificações independentes. Usa os binários PostgreSQL 17 existentes; não instala nada.
- Este relatório em Markdown, sem JSON, traces ou capturas novas solicitadas pelo roteiro de API.

## Revisão independente de código e pendências

O agente de code-review confirmou o formato/progressão e ausência de bloqueio por mesa/rodada. Encontrou por inspeção, sem reprodução por falha injetada:

1. **P2 — Criação versus redefinição de senha.** `accessService.ts` marca pendência antes de trocar a senha; uma criação que se intercale pode retornar sucesso e depois ter a senha sobrescrita pelo reset. Serializar/versionar operações por conta antes de publicar.
2. **P2 — Criação de usuário com falha no perfil.** Se Auth criar o usuário e o insert de perfil falhar, a repetição tenta criar o mesmo email. Precisa recuperação/reconciliação ou compensação antes de publicar.
3. **P2 — Pedido de placar já autenticado versus redefinição.** A revalidação na gravação consulta `must_change_password`, mas não o novo estado de primeiro acesso nem a versão da sessão. Uma chamada que passou pelo middleware antes do reset pode terminar depois dele. Testar e fechar essa janela antes de publicar.
4. **P3 — Texto antigo.** `bracketService.ts` ainda tem mensagem “em ambos os grupos”. A documentação visual/segurança antiga também contém o formato anterior; atualizar na etapa de organização.

Não foi identificado erro nas regras centrais que invalide as simulações executadas. Essas pendências de acesso impedem declarar prontidão integral para publicação, apesar da aprovação da lógica nos testes realizados.

## Tela antiga e próxima etapa visual

Por leitura do código, as rotas de jogador `/ordem-dos-jogos` e `/mesas-agora` já redirecionam para `/jogos`. A duplicação persiste na administração: `/admin/mesas-agora` ainda renderiza `TablesLivePage`, com “fila de confrontos, na ordem em que serão disputados”, e `/admin/escala` permite ajustar fila/mesas. É possível substituí-las por uma apresentação compartilhada de rodadas, preservando redirects e permissões. Recomenda-se fazer isso na etapa aprovada de Administração, sem introduzir ocupação de mesas.

Não houve redesign nesta sessão. As recomendações abaixo são preliminares, baseadas no código, sem inspeção visual atual:

1. Login: distinguir com clareza criação de senha/entrada, feedback de erro e retorno à lista; conferir 320/390 px e teclado.
2. Jogos: reforçar a frase “jogue em qualquer ordem”, dar prioridade aos seis jogos da dupla e ao progresso, conferir formulários/rodadas expandidas no celular.
3. Mata-mata: conferir cruzamentos, final e terceiro lugar simultâneos, estado provisório/empate e pódio no celular.
4. Seguir a ordem solicitada: Minha Dupla, Grupo Único, Início, Hall da Fama/Maiores Campeões e Administração, uma tela aprovada por vez.

Conclusão: lógica do campeonato aprovada nos cenários de API/SQL executados e disponível para a próxima etapa de correções de acesso e homologação visual. Não é aprovação de publicação para os 14 jogadores. O banco local permanece com o campeonato simulado encerrado; repetir o roteiro reinicializa apenas essa cópia local.

## Inventário das alterações locais herdadas

### Arquivos rastreados modificados

- backend/.env.example
- backend/scripts/homologacao-campeonato-api.mjs
- backend/scripts/homologacao-empate-api.mjs
- backend/scripts/homologacao-local.mjs
- backend/src/app.ts
- backend/src/data/homologation/fictitiousAuth.ts
- backend/src/data/homologation/pgSupabaseShim.ts
- backend/src/data/rehearsalStore.ts
- backend/src/data/seed.ts
- backend/src/data/simulationStore.ts
- backend/src/data/store.ts
- backend/src/data/storeKnockout.test.ts
- backend/src/middleware/requireAuth.ts
- backend/src/routes/adminRoutes.ts
- backend/src/routes/authRoutes.ts
- backend/src/routes/bracketRoutes.ts
- backend/src/routes/groupsRoutes.ts
- backend/src/routes/homologationRoutes.ts
- backend/src/routes/playersRoutes.ts
- backend/src/routes/rehearsalChampionship.test.ts
- backend/src/routes/teamsRoutes.ts
- backend/src/services/authService.test.ts
- backend/src/services/authService.ts
- backend/src/services/bracketService.ts
- backend/src/services/drawService.ts
- backend/src/services/editionRules.test.ts
- backend/src/services/groupMatchesService.ts
- backend/src/services/knockoutAutomation.test.ts
- backend/src/services/knockoutRules.test.ts
- backend/src/services/scheduleBuilder.ts
- backend/src/services/simulation/bracketService.ts
- backend/src/services/simulation/drawService.ts
- backend/src/services/teamParticipationService.ts
- backend/src/services/tournamentSimulationService.test.ts
- backend/src/services/tournamentSimulationService.ts
- backend/src/types/database.ts
- backend/src/utils/homologationMode.test.ts
- docs/lancamento-5a-edicao.md
- e2e/championship.spec.ts
- e2e/fixtures/edition5Snapshot.ts
- e2e/rehearsal.spec.ts
- frontend/src/components/truco/HomeTeamHero.tsx
- frontend/src/components/truco/KnockoutBracket.css
- frontend/src/components/truco/KnockoutBracket.tsx
- frontend/src/components/truco/MatchesHero.tsx
- frontend/src/components/truco/StandingsTable.css
- frontend/src/components/truco/StandingsTable.tsx
- frontend/src/components/truco/TeamCard.tsx
- frontend/src/components/truco/TeamProfileHero.tsx
- frontend/src/components/truco/TieDecision.tsx
- frontend/src/context/AuthContext.tsx
- frontend/src/context/auth-context.ts
- frontend/src/pages/LoginPage.tsx
- frontend/src/pages/TablesLivePage.tsx
- frontend/src/pages/admin/AdminBracketPage.tsx
- frontend/src/pages/admin/AdminDrawPage.tsx
- frontend/src/pages/admin/AdminGroupsPage.tsx
- frontend/src/pages/admin/AdminPlayersPage.tsx
- frontend/src/pages/admin/AdminSimulationPage.tsx
- frontend/src/pages/admin/AdminTeamsPage.tsx
- frontend/src/pages/player/GroupsPage.tsx
- frontend/src/pages/player/KnockoutPage.css
- frontend/src/pages/player/KnockoutPage.tsx
- frontend/src/pages/player/MyGroupPage.tsx
- frontend/src/pages/player/PlayerMatchesPage.css
- frontend/src/pages/player/PlayerMatchesPage.tsx
- frontend/src/pages/player/ProfilePage.css
- frontend/src/pages/player/ProfilePage.tsx
- frontend/src/pages/player/StandingsPage.tsx
- frontend/src/services/adminService.ts
- frontend/src/services/authService.ts
- frontend/src/services/playersService.ts
- frontend/src/types/database.ts
- frontend/src/utils/knockout.ts
- frontend/src/utils/opponentInsight.ts
- playwright.homologacao.config.ts
- shared/src/bracket.ts
- shared/src/index.ts
- shared/src/progression.ts
- shared/src/simulation.ts
- shared/src/team.ts
- supabase/homologacao/02_seed_ficticio.sql
- supabase/scripts/edition5_replace_participants.sql

### Arquivos novos herdados

- backend/scripts/homologacao-mesas-api.mjs
- backend/scripts/homologacao-participantes.mjs
- backend/src/services/accessService.ts
- backend/src/services/tablesSuggestion.test.ts
- docs/implantacao-5a-edicao.md
- e2e/primeiro-acesso.spec.ts
- frontend/src/pages/admin/AdminPlayersPage.css
- shared/src/tables.ts
- supabase/homologacao/03_retrato_oficial.sql
- supabase/migrations/202610140001_edition5_single_group_seven_teams.sql
- supabase/migrations/202610140002_first_access_setup.sql
