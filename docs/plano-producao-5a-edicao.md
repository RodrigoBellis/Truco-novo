# Plano de produção da 5ª edição — preparado em 09/10/2026

Nada deste plano foi executado no Supabase. Cada etapa que grava no banco oficial precisa de autorização dada para aquela etapa.

## 1. As quatro migrations

Aplicar nesta ordem, uma por vez, cada uma em transação própria (todas já têm `begin`/`commit`, exceto a do cadeado, que é um único `alter table`).

| Ordem | Arquivo | O que muda | Toca em dados? | Risco |
| --- | --- | --- | --- | --- |
| 1 | `202610070001_edition_six_teams_per_group.sql` | Capacidade 10/5 por função única; `truco_teams.truco_group_id` vira a fonte do grupo; três gatilhos novos (grupo da dupla, espelho na participação, jogo no grupo das duplas); reescreve a RPC de participação | Um `update` de espelho que hoje alcança 0 linhas (conferido: 0 divergências) | Baixo. Para com erro, sem gravar, se houver divergência |
| 2 | `202610070002_results_lock.sql` | Coluna `results_locked`, padrão `true` | Não | Baixo. **Efeito imediato: cadeado fechado** |
| 3 | `202610090001_knockout_uniqueness.sql` | Três índices únicos do mata-mata | Não | Baixo. Confere duplicidade antes e para se houver (hoje: 0 confrontos, 0 jogos de mata-mata em todas as edições) |
| 4 | `202610090002_transactional_progression.sql` | Colunas de revisão e pendência; gatilhos de revisão em nove tabelas; RPCs `truco_rpc_record_match_result_v2` e `truco_rpc_apply_knockout_plan`; **recria o gatilho de auditoria de `truco_championships`** | Não | Médio: é a maior e muda um gatilho que já existe |

### O gatilho de auditoria (migration 4)

Hoje `truco_trg_audit_championships` grava uma linha de auditoria a cada `UPDATE` em `truco_championships`. As colunas novas de revisão e pendência são atualizadas a cada placar, então sem ajuste um campeonato inteiro geraria 263 linhas sem informação em 423 (medido na homologação local).

A migration troca o gatilho único por dois: um para `INSERT` e `DELETE`, igual ao atual, e um para `UPDATE` que só dispara quando muda algo além de `progression_revision`, `progression_pending` e `updated_at`. Abertura e fechamento do cadeado, mudança de fase, status e nome continuam auditados. Depois do ajuste foram 5 linhas em 165.

O que conferir antes de aceitar: a função `truco_fn_audit` não é alterada; o gatilho continua `AFTER ... FOR EACH ROW`; a troca acontece dentro da transação da migration, então não existe instante sem auditoria.

### Pontos de atenção encontrados na revisão

- **Mudança de perfil invalida a revisão.** Qualquer alteração em `truco_profiles` (por exemplo, um jogador trocando a senha no primeiro acesso) incrementa a revisão da edição. Um placar enviado no mesmo instante pode receber "o campeonato mudou" e precisar ser reenviado. Hoje todos os perfis estão com a troca de senha já feita, então o efeito prático é desprezível.
- **Decisão de empate antiga pode valer de novo.** Uma decisão do administrador fica gravada. Se um placar for corrigido e, mais tarde, as mesmas duplas voltarem a empatar em tudo, a decisão antiga é reaproveitada sem pedir nova confirmação.
- **A RPC antiga `truco_rpc_record_match_result` continua existindo** e sem as travas novas. O backend novo não a chama. Pode ser removida depois do campeonato.
- **O backend antigo não funciona com o banco migrado e vice-versa.** O backend novo recusa gravar placar se as colunas de revisão não existirem. Migrations e deploy do backend têm de ir juntos.

## 2. A migration `202610090003_homologacao_runtime_role.sql`

Foi escrita para criar um papel de homologação dentro do Supabase. Essa homologação não foi feita lá e o arquivo não foi aplicado. Deixá-lo em `supabase/migrations/` é um risco: uma aplicação em lote da pasta tentaria executá-lo no banco oficial.

**Feito em 14/10/2026:** movida para `supabase/homologacao/arquivo/` com autorização do organizador. Não foi aplicada em nenhum banco oficial.

## 3. Aplicação segura

### Antes (somente leitura)
1. Confirmar o projeto `sfllpogpuqukhjddwiel` e que a última migration remota do Truco é `20261005232535`.
2. Rodar `supabase/scripts/edition5_precheck.sql` e guardar a saída.
3. Conferir: 0 divergências de grupo entre duplas e participações; 0 jogos de grupo fora do grupo das duplas; 5 duplas aprovadas por grupo; 0 jogos de mata-mata; FK `truco_bracket_matches.truco_match_id` com `ON DELETE SET NULL`. Em 09/10/2026 todos esses itens estavam corretos.
4. Registrar contagem e hash das 12 tabelas `public.truco_*`.

### Backup (precisa de autorização: cria objetos no banco compartilhado)
5. Criar o schema `truco_backup_AAAAMMDD` com uma cópia `create table ... as select *` de cada uma das 12 tabelas. São poucas centenas de linhas. O schema não é exposto na API e não recebe grants.
6. Conferir que as contagens das cópias batem com as originais.
7. Anotar, no painel do Supabase, o horário e o último backup automático disponível.

### Aplicação (precisa de autorização)
8. Avisar os jogadores de que o sistema fica em manutenção e parar o backend.
9. Aplicar as migrations 1 a 4, uma por vez. Depois de cada uma, conferir o que ela criou (colunas, gatilhos, índices, funções) e repetir o hash das tabelas: jogos, placares, duplas, participações, perfis e histórico têm de continuar idênticos.
10. Subir o backend novo (uma única instância) e regenerar os tipos.

### Validação posterior
11. Leituras: login de uma conta real, Início, Grupos, Jogos, Mata-mata, Hall da Fama, Maiores Campeões.
12. Cadeado: confirmar que está fechado e que um jogador recebe a recusa.
13. Testes com Auth e Realtime reais (seção 4).
14. Advisors de segurança do Supabase, olhando só os objetos `truco_*`.

### Recuperação
- **Desfazer o schema:** `supabase/scripts/rollback_progressao_5a_edicao.sql`, depois de voltar o backend para a versão anterior. Validado localmente: colunas, gatilhos, funções e índices voltam idênticos ao retrato do banco real, e as migrations podem ser reaplicadas em seguida.
- **Desfazer dados:** restaurar a partir de `truco_backup_AAAAMMDD`, tabela por tabela, em ordem de dependência. Só com autorização específica.
- **Critério para reverter:** qualquer hash de dados diferente depois de uma migration, qualquer erro ao aplicar, ou falha de login ou de leitura na validação.

O que foi ensaiado localmente: as quatro migrations aplicadas sobre um banco com 20 jogos e 5 placares já gravados deixaram jogos, placares, duplas, participações, perfis, histórico e auditoria idênticos, com o cadeado fechado e a revisão em 0.

## 4. Testes com autenticação e Realtime reais

Objetivo: comprovar o que a homologação local não comprova (PostgREST com `service_role`, Supabase Auth, Realtime), sem risco para resultados oficiais.

A janela certa é **depois das migrations e antes da limpeza dos resultados de teste**: nesse momento os placares que existem são de teste e serão apagados de qualquer forma pela limpeza (seção 5).

1. **Auth, só leitura:** login pela tela com duas contas reais de jogadores e a do administrador; recarregar a página; deixar a sessão renovar o token; sair e entrar com outra conta.
2. **Cadeado:** jogador vê o aviso e não vê botões; administrador abre; os botões aparecem sem recarregar.
3. **Realtime:** dois navegadores com contas de duplas adversárias na mesma partida. Um lança o placar; o outro tem de ver o resultado e a classificação mudarem sem recarregar. Repetir com uma correção.
4. **Permissão:** uma conta de outra dupla tenta lançar o mesmo jogo pela API e recebe 403.
5. **Auditoria:** conferir a linha `match_result` com o autor certo.
6. Fechar o cadeado de novo.

Limite conhecido do Realtime: a política de leitura de `truco_matches` não notifica um jogador sobre jogos de mata-mata de outras duplas. Por isso as telas agora também se atualizam sozinhas a cada 20 segundos. O mata-mata em si não dá para testar em produção sem jogar a fase de grupos inteira; ele fica coberto pela homologação local.

## 5. Os cinco resultados que já existem na 5ª edição

| Jogo | Placar | Gravado em | Auditoria de placar |
| --- | --- | --- | --- |
| Grupo A — Bagriel & Diguinho × Xablauu & Alexandre | 2x1 | 10/08/2026 | nenhuma |
| Grupo A — Bagriel & Diguinho × Vito & Luizão | 2x1 | 10/08/2026 | nenhuma |
| Grupo A — Bagriel & Diguinho × PG & Caio | 1x2 | 10/08/2026 | nenhuma |
| Grupo A — Bagriel & Diguinho × Bitula & Galão | 2x0 | 10/08/2026 | nenhuma |
| Grupo B — Rafael & Pigas × Rogério & Waguinho | 2x0 | 07/10/2026 | 1 lançamento, por conta de jogador |

Os quatro primeiros foram gravados em sequência no mesmo dia de agosto, todos da mesma dupla, antes de existir a auditoria de placar. O quinto é da rodada de validação de outubro. A documentação do projeto trata os dados atuais como dados de teste.

- **Preservar:** não fazer nada. O campeonato começaria com 5 jogos já decididos.
- **Limpar:** `supabase/scripts/edition5_reset_competition.sql`, que já roda primeiro em modo ensaio (mostra as contagens e desfaz tudo) e só grava com `v_ensaio = false`. Ele apaga jogos, mata-mata, decisões de empate e a auditoria de placar da 5ª edição, e não toca em jogadores, contas, duplas, participações nem no Hall da Fama. Exige a migration do cadeado já aplicada. Depois dele os 20 jogos precisam ser gerados de novo.

Nada foi alterado. A limpeza só acontece com sua autorização, depois da troca pelos participantes oficiais ou junto com ela (`docs/lancamento-5a-edicao.md`).

## 6. Empate absoluto

### O que o sistema faz hoje (testado na homologação local)
Três duplas iguais nos cinco critérios, disputando 1º, 2º e 3º do grupo:
- o sistema não escolhe ninguém: sem chaveamento, a fase continua "Fase de Grupos" e as três duplas aparecem como "Empate a decidir";
- o worker não gera nada sozinho;
- jogador não decide (403); decisão incompleta, com dupla de fora, repetida ou no grupo errado é recusada (409);
- o administrador põe as duplas em ordem na tela Grupos e confirma; o mata-mata nasce na mesma chamada, seguindo a decisão;
- se, em vez disso, um jogador corrigir um placar e o empate deixar de existir, o mata-mata nasce sozinho.

O campeonato só para nesse caso, e só até um clique do administrador.

### Proposta para sua aprovação
Um empate absoluto não tem solução por estatística: os números das duplas são idênticos. Qualquer saída precisa de um fato novo. Opções:

1. **Queda de desempate (recomendada).** Regra anunciada antes do torneio: duplas empatadas em tudo jogam uma queda única entre si (com três duplas, um triangular de uma queda). O administrador registra a ordem final na tela que já existe. Decide na mesa, é o mais justo, e não exige código novo.
2. **Sorteio presencial**, na frente das duplas, registrado pelo administrador na mesma tela. Mais rápido, menos justo.
3. **Critério automático extra** (por exemplo, a força da dupla ou a ordem de inscrição). Não trava nunca, mas decide vaga na semifinal por um dado que não vem do jogo. Não recomendo.

Para o campeonato não depender de uma pessoa só: ter uma segunda conta de administrador pronta no dia.

Um detalhe de tela para decidir depois: enquanto o empate espera decisão, a prévia do Mata-mata do jogador mostra as duplas empatadas em posições provisórias ("posição de hoje"), na ordem de inscrição. O aviso no topo explica o empate, mas a prévia pode ser lida como classificação.
