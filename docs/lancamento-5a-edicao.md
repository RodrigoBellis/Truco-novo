# Lançamento da 5ª edição — troca dos participantes de teste pelos oficiais

Procedimento preparado em 07/10/2026. Formato definitivo: 10 duplas, 20 jogadores, 5 duplas por grupo.

## O que muda e o que não pode mudar

| Começa limpo | Fica como está |
|---|---|
| Jogos e placares da 5ª edição (`truco_matches`) | Hall da Fama (`truco_history`, 4 edições) |
| Fila de mesas (colunas dos próprios jogos) | Pares históricos dos campeões (`truco_team_members`) |
| Mata-mata (`truco_bracket_matches`) | Edições 1 a 4 (`truco_championships`) |
| Decisões de empate (`truco_standings_overrides`) | Jogadores e contas de acesso que continuam |
| Participações da 5ª edição (par, grupo e força) | Registro de auditoria (`truco_audit_log`) |

Retrato de partida (07/10/2026, `edition5_precheck.sql`): 10 duplas aprovadas, A=5 e B=5, 20 jogadores distintos, 20 jogos de grupo (5 com placar de teste), nenhum confronto de mata-mata, 21 contas (20 jogadores + 1 superadmin), Hall com 4 edições — 1ª e 2ª Bagriel & Diguinho, 3ª Bitula & Galão, 4ª Ronaldo & Rodrigo. **Correção aplicada em 09/10/2026** (`supabase/scripts/fix_edition3_champion.sql`): a campeã da 3ª edição passou a ser Bitula & Vinícius. O retrato atual tem 22 jogadores cadastrados (Vinícius sem conta e fora do login até entrar numa dupla oficial), 11 duplas (10 da 5ª edição + a histórica) e 21 contas.

## Três riscos que o procedimento evita

1. **As três duplas campeãs do Hall da Fama são linhas da própria 5ª edição.** Apagar uma delas deixaria a edição correspondente sem campeão (a ligação vira nula). Por isso nenhuma dupla é apagada: a que não joga junto nesta edição apenas sai dela. A rota de exclusão de dupla agora recusa duplas do Hall.
2. **Editar o par de uma dupla campeã transferia os títulos antigos para o par novo** em Maiores Campeões. Corrigido no código (`resolveRankingPairs`): os títulos ficam com o par histórico.
3. **Trocar parceiros entre duplas uma a uma esbarra na regra "cada jogador em uma só dupla".** O script regrava as 10 participações de uma vez.

## Passo a passo

Cada script SQL é um único comando: ou acontece tudo, ou nada. Os dois que gravam vêm em modo ensaio (`v_ensaio = true`), que executa, confere as travas e desfaz.

1. **Congelar.** Ninguém lança resultado durante a troca.
2. **Conferir a lista oficial.** 10 duplas, 20 nomes diferentes, 5 por grupo, força de 1 a 5. Para cada nome: já existe em Jogadores? Se não, cadastrar na tela Jogadores (admin) antes de continuar.
3. **Retrato antes.** Rodar `supabase/scripts/edition5_precheck.sql` (somente leitura) e guardar a saída.
4. **Limpar a competição.** `supabase/scripts/edition5_reset_competition.sql` em ensaio; ler as contagens na mensagem "ENSAIO"; trocar `v_ensaio` para `false` e rodar de novo.
5. **Trocar as participações.** Preencher `v_oficial` em `supabase/scripts/edition5_replace_participants.sql`, rodar em ensaio, conferir a lista devolvida na mensagem, depois gravar.
6. **Retrato depois.** Rodar `edition5_precheck.sql` de novo. Têm de bater: 10 duplas, A=5, B=5, 20 jogadores, 0 jogos, e as linhas `hall` e `campeoes` idênticas às do passo 3.
7. **Contas.** Em `backend/`:
   - jogador novo: `node --import tsx --env-file=.env src/scripts/provisionPlayerAccounts.ts` cria a conta com uma senha temporária sorteada;
   - todos os jogadores: `node --import tsx --env-file=.env src/scripts/resetPlayerPasswords.ts` sorteia uma senha temporária diferente para cada um e liga a troca obrigatória no primeiro acesso.
   Os dois gravam a lista em `backend/senhas-temporarias.local.csv` (ignorado pelo git) e não mostram senha no terminal. Entregar a cada jogador a sua e apagar o arquivo depois.
8. **Gerar os jogos.** Como administrador: tela Duplas (conferir as 10), tela Grupos → "Gerar 20 jogos da fase de grupos", tela Escala de Mesas.
9. **Fumaça.** Entrar com uma conta de jogador: troca de senha obrigatória, Início, Minha Dupla, Grupos (5 linhas por grupo), Jogos (4 jogos da dupla), Mata-mata (só posições), Hall da Fama (4 edições) e Maiores Campeões (Bagriel & Diguinho 2; Bitula & Vinícius 1; Ronaldo & Rodrigo 1).

## Se algo der errado

- Erro durante um script: nada foi gravado. Ler a mensagem, corrigir e repetir.
- Problema percebido depois de gravar a limpeza (passo 4): não há o que recuperar além dos placares de teste; seguir.
- Problema depois de gravar as participações (passo 5): corrigir a lista e rodar o script de novo — ele parte do estado atual e regrava as 10.
- Hall da Fama diferente no passo 6: parar e não publicar. A causa só pode ser uma alteração fora destes scripts.

## Senhas

- Cada jogador recebe uma senha temporária própria, sorteada pelo script (8 caracteres, sem letras e números que se confundem). Não existe senha única para todos; o modo `shared` só roda se for pedido com `TRUCO_PASSWORD_MODE=shared` e serve para testes.
- A lista fica só em `backend/senhas-temporarias.local.csv`, fora do git (`*.local.csv` no `.gitignore`). Nenhuma senha está no código, no frontend ou no build.
- Primeiro acesso: com `must_change_password` ligado, o jogador só vê a tela "Crie sua senha" e a API recusa qualquer outra chamada até ele definir uma senha própria de 6 caracteres ou mais.
- A troca de senha exige sessão e só altera a conta do próprio token (`POST /auth/change-password`). Até 07/10/2026 essa rota aceitava um e-mail sem sessão — qualquer pessoa podia trocar a senha de qualquer conta, inclusive a do administrador.
- A conta do administrador não é tocada pelos scripts: trocar a senha dela à parte antes do lançamento.

## O que ainda não foi executado no banco real

Geração do mata-mata, avanço de fase, correção de placar no mata-mata, decisão de empate e os dois scripts que gravam. Tudo isso passou em testes com dados isolados; a primeira execução real deve ser acompanhada.
