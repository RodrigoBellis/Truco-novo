# Homologação: isolamento reprovado antes da criação — 09/10/2026

**Status: interrompido por caminho indireto de escrita.** A autorização para o papel novo não foi utilizada porque a condição de segurança falhou antes de sua criação. Nenhum papel, schema, conta, função, trigger, tabela ou dado fictício foi criado no Supabase. Nenhuma migration foi aplicada. Não houve instalação, commit, push ou deploy.

## Verificações no projeto real

Referência confirmada: `sfllpogpuqukhjddwiel`, projeto CRM, PostgreSQL 17. O histórico de migrations foi consultado. Os dados oficiais foram examinados apenas por contagens e hashes agregados; não foram copiados jogadores ou dados pessoais.

O catálogo real confirmou:

- PUBLIC tem USAGE no schema `public` e TEMPORARY no banco `postgres`.
- PUBLIC não tem SELECT, INSERT, UPDATE ou DELETE nas relações oficiais do Truco. Também não foram encontradas relações não sistêmicas acessíveis por PUBLIC com esses grants; `pg_net` não está instalado.
- Quatro funções de trigger têm EXECUTE para PUBLIC, SECURITY DEFINER e proprietário `postgres`: `mensagens_carimbar_autor`, `mensagens_carimbar_observacao`, `mensagens_carimbar_episodio` e `mensagens_carimbar_lead`.
- A primeira atribui a `NEW.autor_email` o retorno de `public.mensagens_email_logado()`. As demais também atribuem valores a campos de NEW. Essa característica importa porque o tipo do campo pertence à tabela em que o trigger é instalado.
- As rotinas Truco não concedem EXECUTE a PUBLIC. Isso bloqueia chamadas diretas, mas não elimina o caminho indireto por função de outra aplicação.
- O trigger de criação de usuários Supabase continua gravando em `public.truco_audit_log`. Não foram criados usuários Auth, nem alterados seus triggers.

## Prova local reproduzível

Foi usado exclusivamente um cluster PostgreSQL 17 descartável em `127.0.0.1:55444`, com binários que já estavam instalados. O cluster foi encerrado pelo script em `finally`. Não leu `.env`, não conectou ao Supabase e não copiou dados ou funções completas de outro aplicativo: reproduziu o padrão mínimo de permissões/atribuição com nomes artificiais.

Comando: `node backend/scripts/test-knockout-postgres.mjs --isolation-boundary`.

| Verificação | Resultado |
| --- | --- |
| Conexão própria como `local_runtime`, sem SET ROLE/RESET ROLE | Aprovada |
| Proprietário do trigger `local_definer` sem SUPERUSER/BYPASSRLS | Confirmado; tinha acesso apenas à tabela artificial de sua propriedade |
| SELECT/INSERT/UPDATE/DELETE diretos na tabela artificial protegida | Todos recusados por permissão |
| Criação de objeto temporário e instalação do trigger público privilegiado | Permitida pelos grants herdados |
| Avaliação de domínio do campo dentro do trigger SECURITY DEFINER | Executou a função de validação com identidade `local_definer` |
| Escrita indireta na tabela artificial protegida | **Confirmada**, apesar das recusas diretas |
| Migration com barreira de segurança | Recusou o ambiente antes de criar o papel |
| Revogação do EXECUTE público no mock local | Bloqueou a criação do trigger indireto |

A primeira execução confirmou o caminho e a recusa da migration, mas falhou em uma expressão regular de teste que não aceitava a qualificação `public.` na mensagem da defesa. A expressão foi corrigida; a execução final terminou com código 0 e todas as verificações acima passaram.

A prova não explora o Supabase de produção. A conclusão resulta da combinação entre o mecanismo demonstrado localmente e os grants/corpos/proprietários confirmados no catálogo real. Não afirma que ocorreu ataque, leitura indevida ou alteração no projeto real.

## Por que o papel novo não resolve

Um papel novo recebe concessões a PUBLIC mesmo com NOINHERIT. O banco não oferece uma negação individual que retire desse papel algo ainda concedido a PUBLIC. Um papel sem CREATE em schemas permanentes ainda recebe TEMPORARY no banco atual, suficiente para o padrão demonstrado. Restringir search_path ou definir leitura somente por padrão não resolve a permissão.

Portanto, criar apenas o papel e grants em `homologacao` não comprova a garantia exigida. Nem seria aceitável iniciar o ensaio com a chave `service_role` e depender exclusivamente de filtros da aplicação.

A confirmação desse caminho acionou a condição do usuário: "Caso encontre um caminho que permita escrever na produção, interrompa a execução." Os grants e funções de outras aplicações não foram modificados.

## Preservação do campeonato oficial

Uma única consulta agregada calculou quantidade e MD5 de todas as linhas de cada tabela, ordenadas pelo UUID. A consulta foi repetida após a investigação. **As doze contagens e hashes permaneceram iguais.** Isso documenta a preservação durante esta atividade; não substitui uma barreira de permissões nem valida uma homologação que não chegou a existir.

| Tabela oficial | Linhas antes/depois | Hash antes/depois |
| --- | --- | --- |
| `truco_audit_log` | 441 | `3ebba333c41908c3f3c2b4f4e4220da1` |
| `truco_bracket_matches` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `truco_championships` | 5 | `3bfceb607689f67c641e68066d93a00e` |
| `truco_groups` | 2 | `b10c6368502a61c413de0da77bca5757` |
| `truco_history` | 4 | `4bb49a9a25978ff72234b630a0dd2a23` |
| `truco_matches` | 20 | `009eb039eb8a9a4b292206606cbc8797` |
| `truco_players` | 22 | `e48ea66b406571df84a8c7422560b037` |
| `truco_profiles` | 21 | `ebd0cd83df25353960c2484b9d57ca0e` |
| `truco_standings_overrides` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `truco_team_members` | 22 | `a4e33af96ef18b94b76b07b1855de3a8` |
| `truco_team_memberships` | 10 | `93090c19bbac5105f370531eef78c16b` |
| `truco_teams` | 11 | `55b99ca83009a3493f4e17257e352393` |

A consulta final também confirmou que `homologacao` e `truco_homologacao_runtime` continuam inexistentes. Os hashes descrevem todas as tabelas, inclusive as 20 partidas e as quatro linhas históricas atuais; não são somente um health check público.

## Arquivos preparados

- `supabase/migrations/202610090003_homologacao_runtime_role.sql`: local, NÃO APLICADA. Recusa triggers SECURITY DEFINER públicos combinados com TEMPORARY antes de criar um papel NOLOGIN. Passar essa checagem não dispensaria auditoria completa de outros caminhos.
- `supabase/scripts/homologacao_precheck.sql`: somente leitura, inclui grants efetivos e combinação perigosa.
- `backend/scripts/test-homologacao-isolation.mjs`: regressão exclusivamente local; prova a insuficiência da restrição direta e verifica a defesa no mock.
- `docs/homologacao-no-projeto-atual.md`: plano da estrutura, sujeito ao bloqueio confirmado neste relatório.

Não há migrations de tabelas aplicadas nem backend SQL integrado. Não existe credencial nova a remover ou rotina remota de limpeza a executar.

## Cobertura e pendências

| Área solicitada | Status desta rodada |
| --- | --- |
| Catálogo e permissões do Supabase real | ANALISADOS; isolamento REPROVADO |
| Prova do mecanismo de acesso indireto | CONFIRMADA em PostgreSQL local descartável |
| Comparação das doze tabelas oficiais | Contagens/hashes IDÊNTICOS nas duas medições |
| Papel e schema reais de homologação | NÃO CRIADOS |
| Campeonato de 27 partidas no Supabase atual | NÃO EXECUTADO; bloqueado pela segurança |
| Concorrência/transações do campeonato no schema real | NÃO TESTADAS nesta rodada |
| Backend integrado ao schema real | NÃO IMPLEMENTADO; bloqueado antes da conexão |
| Supabase Auth real | NÃO TESTADO |
| Supabase Realtime real | NÃO TESTADO |
| Prontidão para produção | NÃO CONFIRMADA |

Os testes completos anteriores em memória e as regressões transacionais locais continuam sendo evidências próprias, descritas em `docs/code-review-estabilidade-5a-edicao.md`. Não foram reclassificados como testes de homologação real.

## Alternativas dentro das condições

Mantendo a proibição de alterar grants existentes, a opção disponível sem instalar nada é usar o PostgreSQL local já instalado com estrutura completa e dados fictícios. Isso oferece banco/transações reais, mas não equivale ao projeto Supabase real.

Para manter a homologação neste projeto com a barreira SQL exigida, seria necessária autorização diferente, estritamente delimitada, para remover EXECUTE concedido a PUBLIC nas funções de trigger privilegiadas e revisar as outras funções públicas antes de testar novamente. Essa proposta afeta permissões compartilhadas de outra aplicação e não foi executada. É necessário revisar consumidores e validar que os triggers legítimos continuam funcionando; não é uma licença para alterar CRM/mensagens genericamente. Revogar TEMPORARY de PUBLIC seria uma mudança alternativa mais abrangente e também está fora da autorização atual.

Referências: [Supabase — privilégios herdados de PUBLIC](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c), [PostgreSQL 17 — SECURITY DEFINER](https://www.postgresql.org/docs/17/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).
