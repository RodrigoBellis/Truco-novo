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

## Campeonato automático (09/10/2026)

Do primeiro jogo ao campeão o sistema anda sozinho. As regras ficam em `shared/src/progression.ts` (`planKnockoutSync`, `planResultChange`); o backend só executa os passos (`backend/src/services/bracketService.ts`, `syncKnockout`).

### O que o administrador faz no dia 25/10

Uma coisa: **abrir o cadeado de resultados** (tela do administrador, ou `POST /api/admin/results-lock` com `{ "locked": false }`). O botão "Gerar mata-mata" não é mais necessário.

### O que acontece sozinho

1. **Fase de grupos, sem ordem obrigatória.** Qualquer integrante das duas duplas lança qualquer jogo da dupla, em qualquer ordem, e corrige quantas vezes quiser. Mesa, bloco e fila são só exibição. Cada placar recalcula a classificação.
2. **Mata-mata nasce no 20º placar.** Com os dois grupos encerrados (5 duplas, 4 jogos cada) e sem empate pendente, o chaveamento (7 confrontos) e as duas repescagens são criados na mesma chamada que gravou o último placar. Com 19, nada existe.
3. **Correção de grupo depois disso.** Aceita enquanto nenhum jogo do mata-mata tem placar: se a classificação mudou, o chaveamento é desfeito e refeito; se não mudou, fica como está. Depois do primeiro placar de mata-mata, recusada para todos, inclusive o administrador (409).
4. **Avanço.** Quartas só com as duas repescagens encerradas; semifinal quando a quarta correspondente termina; final com as duas semifinais. Nenhum jogo existe antes de os dois adversários serem conhecidos. Corrigir mantendo o vencedor sempre pode; trocar o vencedor só enquanto a fase seguinte não tem placar (na repescagem, basta uma das quartas ter placar para recusar).
5. **Campeão.** Com o placar da final, campeão e vice entram em `truco_history` (uma linha por edição; se o administrador corrigir a final, a linha acompanha) e `current_phase` vira "Campeonato Finalizado". A partir daí jogador não lança nem edita nada (403); o administrador ainda corrige.

Respostas da API ao lançar placar: 403 cadeado fechado (`results_locked`), jogador de fora da partida, edição encerrada (`edition_finished`); 409 estado não permite (`result_conflict`); 400 placar inválido; 503 placar gravado mas avanço pendente (`progression_pending`).

### Exceção: empate absoluto

Empate que sobrevive a pontos, vitórias, 2x0, confronto direto e saldo **não é sorteado nem resolvido pelo sistema**. O mata-mata não é gerado, a classificação mostra "Empate a decidir" e o administrador decide a ordem na tela Grupos (`POST /api/groups/:id/tiebreak`). Decidido o último empate, o mata-mata é gerado na mesma chamada. Num grupo de 5 isso só acontece em três formas: três duplas iguais que se venceram em círculo; quatro duplas iguais com 2-2-1-1 vitórias entre si (dois pares pendentes); as cinco duplas iguais.

### Se algo falhar no meio

A sincronização parte sempre do que está gravado: rodar de novo completa o que faltou e nunca duplica. Ela roda ao gravar qualquer placar, ao decidir um empate, em `GET /api/bracket` (abrir a tela Mata-mata) e em `POST /api/bracket/generate` (administrador). `GET /api/bracket/status` mostra `syncPending` e `anomalies` sem gravar nada. Estado que as regras não permitem (por exemplo, chaveamento diferente da classificação com placar de mata-mata já lançado) não é corrigido sozinho: fica em `anomalies` e no log.

**Uma instância só.** A fila que impede dois lançamentos de se cruzarem vive na memória do processo. No dia do evento o backend deve rodar em uma única instância. A migração abaixo é a proteção para o caso de haver mais de uma.

### Migração pendente

`supabase/migrations/202610090001_knockout_uniqueness.sql` e `202610090002_transactional_progression.sql` — **escritas, não aplicadas**. A primeira acrescenta três índices únicos. A segunda acrescenta versão do estado, invalidação dos planos antigos e RPCs transacionais para placar/auditoria e avanço/campeão. O backend local exige a segunda para gravar no banco; se ela estiver ausente, recusa a operação. Validar ambas primeiro no Supabase de homologação. A fila em memória não é prova nem substituto dessas garantias.

### Conferir antes do evento (somente leitura)

- `truco_history` sem linha da 5ª edição antes do campeonato oficial. Nunca executar a simulação completa em produção: ela cria um campeão fictício, e `edition5_reset_competition.sql` **não o remove**. Usar apenas memória ou homologação dedicada.
- As 10 duplas oficiais com `is_placeholder = false`: dupla marcada como placeholder não aparece em Maiores Campeões, mesmo campeã.
- Nenhuma dupla oficial com par histórico (`truco_team_members`) diferente do par da edição. O Hall da Fama mostra os nomes do par histórico; para dupla sem par histórico, ele é preenchido com o par da edição ao registrar campeão e vice.

### Modo ensaio (sem Supabase)

A API real (mesmas rotas, middlewares, serviços e regras) com dados fictícios em memória.

- Subir: `npm run dev:rehearsal --workspace backend` → `http://localhost:3101`. Não lê `backend/.env`, não cria cliente Supabase e recusa subir com `NODE_ENV=production`. `GET /api/health` responde `{ "status": "ok", "rehearsal": true }`.
- Dados: 10 duplas (`ensaio-dupla-a1` … `b5`), 20 jogadores (`ensaio-jogador-01` … `20`), 1 administrador (`ensaio-admin`, superadmin), 20 jogos de grupo sem placar, cadeado fechado, edições 1 a 4 fictícias.
- Entrar: `POST /api/auth/login` com `{ "playerId": "ensaio-jogador-01", "password": "ensaio-2026" }`. `GET /api/rehearsal/status` lista as contas.
- Reiniciar: `POST /api/rehearsal/reset` (os tokens já emitidos continuam valendo; reiniciar o processo invalida todos).
- Navegador: subir o frontend com `VITE_API_URL=http://localhost:3101/api`, `VITE_SUPABASE_URL=http://localhost:3101` e qualquer `VITE_SUPABASE_PUBLISHABLE_KEY`. O backend de ensaio responde o que o navegador pede ao Supabase: `/auth/v1/user`, `/auth/v1/token?grant_type=refresh_token`, `/auth/v1/logout`, `/rest/v1/truco_history`, `/rest/v1/truco_championships`. Realtime não é emulado. Para entrar sem passar pela tela, gravar em `localStorage["truco-do-novo:session"]` o JSON `{ user, token, refreshToken }` devolvido pelo login.
- Testes: `backend/src/routes/rehearsalChampionship.test.ts` roda o campeonato inteiro por HTTP nesse modo.

## O que ainda não foi executado no banco real

Geração automática do mata-mata, desfazer/refazer o chaveamento, avanço de fase, correção de placar no mata-mata, decisão de empate, registro do campeão no histórico (incluindo o preenchimento do par histórico) e os dois scripts que gravam. Tudo isso passou em testes com dados isolados e no modo ensaio; a primeira execução real deve ser acompanhada.
