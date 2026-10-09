# Direção visual — Truco do Novo, 5ª Edição

## Contexto e público

Campeonato entre amigos. O jogador entra por sua conta individual, mas acompanha e registra jogos da dupla compartilhada. A experiência principal é no celular. A interface deve dar vontade de disputar e conquistar o próximo título, com informação esportiva clara.

## Direção aprovada pelo usuário

- Sidebar grafite no tema escuro restaurado; azul marinho no tema claro alternativo. Links, posição e detalhes em azul.
- Laranja vivo nas ações e seleções principais; estrelas em laranja/dourado.
- Fundo preto/grafite anterior restaurado (`#080a10`) a pedido do usuário, com superfícies escuras correspondentes e textos claros. Sem creme ou linhas diagonais. Aparência escura é o padrão.
- Tema claro alternativo preservado. A restauração é aplicada uma vez à preferência visual salva; escolhas posteriores no seletor continuam persistindo.
- Personalidade esportiva e amigável, sem aparência de painel empresarial.
- Tipografia atual consistente, títulos fortes, números tabulares, ícones SVG.
- Bordas finas, sombras suaves e raios compartilhados. Evitar ruído visual, gradientes em texto e botões pesados.

## Componentes e tokens

Fonte de cores e escalas: `frontend/src/styles/variables.css`.

- `TeamProfileHero`: card protagonista de Minha Dupla — os dois jogadores (você/parceiro), nome da dupla, força em estrelas, grupo, posição em texto pequeno e o botão do grupo. Substituiu `TeamIdentityCard` em 09/10/2026.
- `TeamPerformanceStrip`: pontos, vitórias, derrotas e saldo de quedas numa faixa só; sem classificação mostra travessões. Substituiu `TeamCampaignStats` em 09/10/2026.
- `TeamRecentResults`: os três jogos encerrados mais recentes da dupla, com adversário, placar, Vitória/Derrota e pontos.
- `TeamCrest`: escudo/marca de cor da dupla, usado no card da dupla, no próximo confronto, nos jogos e na classificação.
- `TeamStrength`: escala real de uma a cinco estrelas, com texto e rótulo acessível.
- `MatchCard`: uma dupla por linha, sets e pontos associados a cada lado, resumo do placar e ações permitidas.
- `StandingsTable`: tabela completa no desktop; estatísticas secundárias e situação junto à dupla no celular.
- `MajorChampionsPodium`: pódio do ranking calculado pelo serviço central, com todos os empates preservados. Cada posição é uma vitrine com o caneco da abertura (`OpeningTrophy`): ouro no 1º, prata em todo 2º, 3º neutro sem metal. `compact` é a versão de “Quem já fez história” na abertura; sem `compact` é a galeria de Maiores Campeões; `mineKey` marca “Sua dupla” com selo neutro.
- `EditionPlaques`: plaquinha gravada (“3ª EDIÇÃO”), o único jeito de mostrar edições conquistadas no pódio e na lista “Também levantaram o caneco”. Rótulo acessível “Edições conquistadas”.
- `EditionTimeline`: linha do tempo do Hall da Fama, só por edições. Cada capítulo (`<li>` de uma `<ol>`) tem o caneco da abertura em ouro com a plaquinha da edição, duas cartas em leque (a manilha do naipe da edição), o número da edição em destaque, o rótulo “Campeões” com nomes e avatares e o botão “Ver detalhes da Nª edição”. A edição em disputa fecha a lista com caneco só no contorno e cartas viradas. O movimento vem de `hooks/useTimelineScroll` (sem biblioteca).
- `TournamentHistory`: junta a `EditionTimeline` e o detalhe da edição escolhida (nome, campeões, vice e placar quando registrados, nota ou frase montada com dados reais, sem ano e sem contagem de títulos). A edição escolhida é controlada pela página.

## Formato e zonas (regra definitiva de 07/10/2026)

10 duplas, 5 por grupo. 1º direto na semifinal (verde), 2º direto nas quartas (azul), 3º e 4º na repescagem (laranja), 5º eliminado (vermelho). A linha inteira da classificação leva a tinta da zona, com barra sólida na borda; a legenda diz a cor por extenso (“Verde = Semifinal”). “Sua dupla” usa moldura e selo na cor do texto, neutros, para não se confundir com nenhuma zona. Ordem da classificação (fechada em 07/10/2026): pontos, vitórias, vitórias por 2x0, confronto direto e saldo de quedas — a tabela mostra as colunas “2x0” e “Saldo” e a legenda repete a ordem. Num grupo completo, duplas iguais nos três primeiros têm sempre o mesmo saldo; quem desempata de fato é o confronto direto. Só o empate que sobrevive aos cinco (o “triângulo”) aparece como “Empate a decidir” e espera o administrador. O parágrafo de três zonas logo abaixo é o registro anterior e foi substituído por este.

### Mata-mata (`/mata-mata` e `/admin/mata-mata`)

Fluxo: Fase de grupos → Repescagem → Quartas de final → Semifinal → Final. As quartas só são montadas quando as duas repescagens terminam: cada 2º colocado enfrenta, sempre que possível, um vencedor vindo do outro grupo (`decideQuarterfinalPairing`). Antes disso o lado em aberto aparece como “Vencedor da repescagem”. Quando os dois vencedores saem do mesmo grupo o reencontro é inevitável: o card ganha o selo “Reencontro do grupo” e a tela explica o motivo. `KnockoutBracket` desenha o chaveamento a partir de `buildKnockoutView` (`@truco/shared`): cinco colunas ligadas por conectores no desktop (cada jogo na mesma linha do que o alimenta, por isso as Quartas 2 ficam acima das Quartas 1) e uma trilha vertical no celular, sem rolagem lateral — a troca é por container query. Antes do fim dos grupos a tela mostra as posições (“3º do Grupo A”) e, com jogos em andamento, quem ocupa cada uma hoje, marcado como provisório. Vencedor com faixa e placar laranja, perdedor apagado, conector aceso quando o jogo termina; o card do campeão usa o caneco da abertura e só ganha cor quando a final acaba. Movimento: colunas em cascata, conectores que se desenham, pulso quando uma vaga ou placar muda; nada em laço.

#### Resultado no chaveamento e fases automáticas (09/10/2026, a pedido do usuário)

Não existe mais “Gerar mata-mata”. O administrador só abre o cadeado de resultados; com os jogos de grupo encerrados a repescagem nasce sozinha, cada resultado promove o vencedor, as quartas só existem com as duas repescagens encerradas e a final registra o campeão e encerra a edição. A única pendência do administrador é o empate absoluto (“a decidir”); o mata-mata nasce logo depois da decisão. Nenhuma tela chama `POST /bracket/generate` nem diz que o administrador confirma ou gera fases.

- **Lançar no próprio confronto.** Cada card do `KnockoutBracket` mostra fase, duplas, placar e situação (“Aguardando”, “A jogar”, “Encerrado”) e, no rodapé (`renderActions`), “Lançar resultado” (laranja) ou “Editar resultado” (discreto). O botão só aparece para integrante de uma das duas duplas, com o jogo criado, a dupla aprovada, o cadeado aberto e a edição sem campeão; para os demais o card é só leitura. O id do jogo vem de `summarizeKnockout().matchIds` (cruza `bracket.matchId` com o plano oficial), sem mudar `@truco/shared`.
- **Um fluxo só.** `hooks/useResultEntry` concentra salvar, confirmar correção (`ConfirmDialog`), toasts e a recusa da API; Jogos, Mata-mata e o mata-mata do administrador usam o mesmo hook e o mesmo `ScoreForm`. Os textos mudam com a fase do jogo: no mata-mata falam de vaga e chaveamento, nunca de “classificação do seu grupo”. A mensagem da API aparece sempre como veio; num 403 o formulário fecha e o cadeado é relido.
- **Cadeado fechado:** nenhum botão e o aviso `RESULTS_LOCKED_MESSAGE` no topo, como em Jogos.
- **Painel “Sua dupla no mata-mata”** (topo da tela, só para quem tem dupla e com o chaveamento criado). É lido do chaveamento (`teamKnockoutStatus`), por isso sobrevive ao refresh e vale para os dois integrantes:
  - avanço, com texto por fase: “Classificados para as quartas de final!”, “Classificados para a semifinal!”, “Vocês estão na final!”, “Campeões da 5ª edição!”, e o placar que decidiu;
  - despedida sóbria: “Fim da campanha nesta edição” (também para quem ficou fora das vagas no grupo);
  - “Sua vez”: o confronto pronto e sem placar, com o nome do adversário e o botão de lançar (o formulário abre no próprio painel);
  - espera: “Vocês aguardam o vencedor das Quartas 2, na Semifinal 1.”
  Avanço em laranja, despedida neutra; verde e vermelho continuam exclusivos das zonas. O toast do lançamento repete o texto do painel.
- **Formulário de placar no card:** em coluna estreita do chaveamento largo os quatro placares viram 2×2 e os botões empilham (container query do rodapé); alvos de 44 px; cabe em 320 px.
- **Movimento, tudo com fim:** o painel entra subindo e refaz a entrada quando a dupla passa de fase; nome da vaga, placar e situação pulsam quando mudam (`useValueChangePulse`). A tela não desmonta ao recarregar os dados, para o pulso acontecer. Nada em laço.
- **Jogos:** filtro “Mata-mata” sempre presente (uma seção por fase; vazio explica que os jogos aparecem sozinhos). Jogo de mata-mata não mostra “+N pts”, e o “Próximo jogo” do topo troca a leitura da tabela do grupo pela fase do confronto.
- **Admin (`/admin/mata-mata`):** sem botão de gerar. Explica que as fases nascem sozinhas, mostra o chaveamento, lista os jogos para “Registrar resultado” / “Corrigir resultado” (com confirmação) e, havendo empate pendente, aponta para Grupos (“Decidir o empate em Grupos”).

### Maiores Campeões e pódio histórico (redesenho de 09/10/2026)

Substitui o registro de 07/10/2026 (placa dourada chapada, medalhas e casas de edição). Ouro e prata continuam existindo só nesta área, e agora só no metal: caneco, filete, luz, contagem e plaquinhas.

- Um caneco só: `OpeningTrophy` tem `metal` (`copper`, o padrão da abertura e do mata-mata, intocado; `gold`; `silver`) e `plate` (texto do pedestal; `null` no pódio). Os ids do SVG são únicos por instância. O ícone plano `ChampionTrophy` saiu do Hall da Fama em 09/10/2026 e não é mais usado por nenhuma rota.
- 1º lugar: vitrine quase preta com toque quente, igual nos dois temas, com filete dourado, foco de luz atrás do caneco, poça de luz e reflexo no tampo. Empate em 1º: todos recebem a mesma vitrine.
- 2º lugar: vitrines prateadas idênticas para todos os empatados (lado a lado quando cabem). Grafite frio no tema escuro, platina clara no tema claro.
- 3º lugar com título: card neutro pelos tokens, medalha com ícone, sem metal. Dupla sem título nunca sobe ao pódio.
- Hierarquia do card: posição → nome → plaquinhas de edição; a contagem de títulos é o número de destaque (coluna à direita; na vitrine empilhada do celular fecha o card). A altura sai do conteúdo; nomes quebram, nunca são cortados.
- Layout por container query da própria vitrine (`@container vitrine`): empilhada abaixo de 480 px no 1º lugar, caneco à esquerda nas demais.
- Movimento, tudo com fim: vitrines em cascata, caneco sobe e assenta, uma varredura de brilho, contagem animada e plaquinhas em sequência. Hover (só ponteiro): leve elevação e um brilho que cruza a vitrine. Nada em laço.
- Duas versões, a pedido do usuário (09/10/2026): `compact` (abertura, intocada) e a galeria de Maiores Campeões (`.champions-podium-gallery`, a versão sem `compact`). Tudo que é só da galeria fica sob essa classe, para não vazar para a abertura:
  - caneco de ouro maior, com um facho de luz descendo sobre ele; sobe de mais longe e assenta com leve repique; uma varredura de brilho cruza a vitrine de ouro na entrada; prata e 3º lugar entram depois do ouro;
  - vitrine sozinha na fileira não estica: ouro até 820 px, prata/3º até 640 px, centralizadas;
  - empatadas têm a mesma altura, com posição em cima, plaquinhas embaixo e o nome no meio, para contagem e plaquinhas ficarem na mesma linha mesmo quando um nome quebra;
  - linha de chão (horizonte) atrás da fileira do ouro.

## Semântica das cores

Verde identifica a zona de semifinal; laranja, repescagem; vermelho, eliminação. A pedido do usuário (06/10/2026), além dos badges, o fundo de cada linha da classificação é pintado na cor da zona, com faixa lateral sólida da mesma cor (tinta mais forte no tema escuro). “Sua dupla” ganha moldura laranja em volta da linha e o selo “Sua dupla”, sem preencher a linha de azul. Usar rótulos para não depender exclusivamente da cor.

Preservar a separação entre superfícies e detalhes, com esporte, diversão e contraste. A solicitação mais recente de fundo preto prevalece sobre a direção clara das rodadas anteriores.

### Referência do fundo

O experimento de fundo creme com diagonais da referência enviada em 05/10/2026 foi rejeitado pelo usuário e removido. A instrução mais recente é restaurar o fundo preto anterior. Não reaplicar a referência nem substituir o preto por azul noturno.

### Cor de cada dupla

A pedido do usuário (06/10/2026), cada dupla tem uma cor própria. O matiz vem de `frontend/src/utils/teamColor.ts` (ordem estável dos ids da edição, sem coluna no Supabase) e a classe `.team-tint` em `styles/global.css` ajusta luminosidade por tema. A cor identifica a dupla em escudo, anel do avatar e marca ao lado do nome (nos cards de jogo, só no anel dos rostos); não substitui os badges de zona nem o laranja de “Sua dupla”.

### Tela Jogos (redesenho de 06/10/2026)

O usuário achou a tela anterior feia e confusa. Direção atual: placar esportivo limpo, cada informação aparece uma vez só.

- Topo em um painel único (`MatchesHero`): dupla, “Está no Grupo X” na cor do grupo, posição real, pontos/vitórias/derrotas/a jogar da classificação (travessão sem dados) e, ao lado, o próximo jogo com a leitura da tabela (`opponentInsight`).
- Meus Jogos separa “Próximos confrontos” (ordem da fila) e “Já jogados” (mais recente primeiro); filtros de grupo continuam agrupando por rodada. Títulos de seção trazem a contagem.
- `MatchCard`: cabeçalho só com “Jogo N” e selo de situação; uma dupla por linha com rostos no anel da cor da dupla, nome, força e sets grandes. Vencedor com sets em verde, perdedor apagado. Sem rodapé de placar repetido.
- Jogo da própria dupla: faixa lateral fina na cor do resultado e selo textual (verde “Vitória”, vermelho “Derrota”, laranja “A jogar”); a linha da dupla tem fundo laranja suave e selo “Sua dupla”. Lançar resultado é botão laranja; editar é botão discreto.
- Cor de cada grupo: Grupo A ciano e Grupo B magenta (`utils/groupColor.ts` + `.group-tone` em `styles/global.css`), só na bolinha das abas, no título da seção e na etiqueta do painel do topo.

### Início

Remodelado em 09/10/2026 a pedido do usuário: Home enxuta, com cara de campeonato e não de dashboard. O jogador identifica na hora a dupla, a força, o grupo e o início do campeonato. Dois blocos, nesta ordem, abaixo do cabeçalho “Olá, {nome}!” (que mantém “Rever abertura”). A altura de cada bloco sai do conteúdo; medidas por container query de `.player-home`, porque a barra lateral reduz a largura útil.

**1. Card da dupla (`HomeTeamHero`, só da Home; Minha Dupla tem o próprio card, `TeamProfileHero`).** É o elemento dominante.

- Nome da dupla em destaque; os dois integrantes lado a lado com avatares grandes, anel na cor da dupla (`.team-tint`) e a marcação “Você” (selo neutro) / “Seu parceiro”, a partir de `user.playerId`.
- Força em cinco estrelas grandes laranja/douradas com o texto “Força N de 5”; força ausente ou inválida mostra “Força a definir”, sem estrela.
- Grupo como marca única na cor do grupo (`.group-tone`): “GRUPO” + letra em disco. Sem grupo: “Grupo a definir”.
- Botão laranja “Ver meu grupo” → `/grupos` (que abre no grupo da dupla); sem grupo vira “Ver grupos”.
- Luz no tratamento da abertura: feixe azul de cima à esquerda, calor laranja no canto oposto e um halo na cor da dupla atrás dos rostos; fio de 1 px na cor da dupla no topo. Intensidade por tema (`--hero-*-alpha`).
- Não mostra posição, zona, aprovação, “cabeça de chave” nem pontos/vitórias/derrotas/saldo: posição e números moram em Minha Dupla e Grupos; a zona, só em Grupos.
- Empilhado e centralizado abaixo de 620 px de container; duas colunas (texto e ação à esquerda, dupla à direita) acima disso. Nomes longos quebram.

**2. Faixa “Rumo ao campeonato” (`EditionCountdown`).** Secundária, mais baixa que o card, uma composição só.

- Data “25/10/2026 · 12h”, sempre no fuso de São Paulo. A data mora em UMA constante, `EDITION_START` em `frontend/src/utils/editionSchedule.ts` (12h de America/Sao_Paulo); por decisão do usuário fica no código, sem coluna nem migração.
- Contagem regressiva (dias, horas, min, seg; números tabulares) até o início. Chegado o horário, a contagem dá lugar à situação da edição, sem zeros parados nem números negativos.
- Situação da edição, função pura `editionStatus({ now, locked, champion })`: campeão oficial (`dashboard.champion`) → “Encerrado”; senão, antes do horário → “Aguardando início”; senão, cadeado fechado → “Aguardando liberação do administrador”; senão → “Em andamento”. Placares e jogos lançados NÃO entram na regra (há placares de teste). Sem resposta do painel a faixa continua com data, contagem e cadeado e nunca afirma “Encerrado”.
- Cadeado: “Resultados bloqueados/liberados”, lido de `useResultsLock()` (sem resposta = bloqueado). A Home só exibe; o cadeado do Admin continua sendo a única fonte de verdade.
- Uma frase curta de mesa de truco que muda com a situação; não afirma dado nenhum. Com campeão oficial, o nome da dupla campeã aparece junto de “Encerrado”.
- Cores da situação: azul (aguardando início), laranja (liberação/andamento), neutro (encerrado). Verde e vermelho continuam exclusivos das zonas.

Movimento, tudo com fim: cascata do `.page-enter`, luz do card revelando, integrantes subindo, estrelas acendendo uma a uma, seta do botão avançando no hover e botão afundando no clique. A contagem só troca o texto dos números (um tique por segundo, sem timer depois do horário), sem animação nem transição.

Saíram da Home (09/10/2026): “Próximo confronto”, “Resumo da campanha”, o banner azul “O próximo caneco pode ter o nome de vocês” e as buscas de jogos, classificação e fila que só eles usavam. Jogador sem dupla vê “Sua dupla está a caminho” e a faixa. Sem atalhos repetindo o menu.

### Minha Dupla (perfil da dupla, 09/10/2026)

Remodelada a pedido do usuário para parecer o perfil oficial de uma dupla de campeonato. Substitui a composição anterior (card de identidade com escudo e posição gigante, um card por jogador e o painel “Resumo da campanha”). Prioridade de leitura: jogadores → força → grupo → desempenho → histórico. Quatro blocos, nesta ordem, medidos por container query de `.my-team` e limitados a 1080 px de largura.

1. **Cabeçalho discreto.** `h1` “Minha Dupla” e o subtítulo “Truco do Novo · 5ª Edição” (texto fixo, como nas outras telas). Sem card; o subtítulo não repete o nome da dupla, que aparece uma única vez na página.
2. **Card da dupla (`TeamProfileHero`), um card só.** Dois avatares grandes lado a lado, com anel na cor da dupla (`.team-tint`) e halo da mesma cor atrás; o nome de cada jogador sob o avatar, com “Você” (selo neutro) / “Seu parceiro” a partir de `user.playerId`. Nome da dupla em `h2` e cinco estrelas com “Força N de 5”; força ausente ou inválida mostra “Força a definir”, sem estrela. Grupo como marca na cor do grupo (`.group-tone`) e, ao lado, a posição em texto pequeno (“2º lugar”) só quando há classificação; sem grupo, “Grupo a definir”. Botão laranja “Ver meu grupo” → `/grupos` (“Ver grupos” sem grupo). Mesma luz do card do Início. Selos: só “Aprovação pendente”, e só quando a dupla não está aprovada; “Zona de…”, “Dupla aprovada” e “Cabeça de chave” saíram (a zona continua em Grupos).
3. **Faixa de desempenho (`TeamPerformanceStrip`).** Pontos | Vitórias | Derrotas | Saldo de quedas numa faixa compacta, Pontos um pouco maior e em laranja. Os valores são os da linha da dupla em `getStandings`, sem recálculo; saldo com sinal; sem classificação, travessões. Não repete grupo, jogadores nem estrelas.
4. **Histórico da dupla (`TeamRecentResults`).** Os três jogos encerrados mais recentes (`getMatches({ teamId })`, com placar lançado; mais recente = maior posição na fila, ordem original como desempate, mata-mata à frente dos grupos). Cada linha: adversário, placar em quedas do ponto de vista da dupla (“2 × 1”), selo Vitória/Derrota nas cores da tela Jogos e os pontos de `pointsForResult` (“+3 pts”). Botão “Ver todos os jogos” → `/jogos`. Sem jogo encerrado: “A campanha ainda não começou”. Se a busca de jogos falhar, só o histórico fica indisponível; o resto da página continua.

Layout: no container largo (≥ 700 px) a identidade fica à esquerda e grupo + botão numa coluna à direita, separada por um fio; o nome desce para baixo dos rostos quando não cabe ao lado. No celular tudo centraliza, o botão ocupa a largura toda, a faixa vira grade 2×2 e cada jogo usa duas linhas. Nomes quebram, nunca são cortados.

Movimento, tudo com fim: cascata do `.page-enter`, luz do card revelando, avatares em sequência, estrelas acendendo uma a uma, números contando até o valor (`AnimatedCounter`) e linhas do histórico em cascata. Hover só para ponteiro.

### Hall da Fama (linha do tempo por edições, 09/10/2026)

Remodelado a pedido do usuário: cada edição é um capítulo da história do Truco, numa linha do tempo cinematográfica. Substitui o registro anterior (faixa azul chapada, seletor de edições com ano e medalha azul). O ranking acumulado continua só em Maiores Campeões, alcançado por link (só para `jogador`); aqui não há contagem de títulos.

- Organização exclusivamente por edições, em ordem cronológica (1ª → última encerrada → edição em disputa). O ano não aparece na linha do tempo nem no detalhe, nem em rótulos acessíveis.
- Capítulos vêm de `buildEditionChapters` (`utils/hallOfFame.ts`): as edições de `truco_history` e, por último, `currentEdition` quando ela ainda não está no histórico. Nenhum número de edição é fixo no código; edição nova aparece sozinha.
- Edição encerrada: caneco em ouro (`OpeningTrophy`, `metal="gold"`, plaquinha “Nª EDIÇÃO”), duas cartas em leque atrás da taça (verso + a manilha do naipe da edição), halo laranja com aro azul, número da edição grande, “Campeões” e os dois nomes com avatar. Sem dupla registrada: “Dupla não registrada”.
- Edição em disputa: “Nª Edição · Em disputa · A próxima história será escrita”, caneco só no contorno tracejado, cartas viradas, luz fria. Sem campeão, sem nome de dupla e sem botão de detalhe.
- Cabeçalho sem card, na luz da abertura: selo “A história · Truco do Novo”, `h1` “Hall da Fama”, frase curta, número real de edições encerradas e o botão fantasma do ranking. No desktop largo ele é o primeiro quadro da trilha.
- Desktop largo (janela ≥ 961 px de largura e ≥ 700 px de altura, container ≥ 900 px, três capítulos ou mais): a seção prende na tela (`position: sticky`) e a rolagem vertical desliza a trilha na horizontal, 1 px por 1 px. Capítulos alternam acima e abaixo da linha; a linha laranja cresce com a rolagem; cada capítulo acende quando a cabeça da linha chega nele (ponto, haste, caneco, cartas e texto subindo de dentro de uma máscara). Setas “Edição anterior / Próxima edição”, os pontos da linha (“Ir para a Nª edição”) e o indicador “Edição N de M” levam a rolagem até o capítulo. Foco por teclado num capítulo fora da tela rola a página até ele.
- Celular, tablet e desktop estreito: trilho vertical à esquerda cuja linha cresce com a rolagem; capítulos empilhados revelam ao entrar na tela. Sem rolagem lateral em 320 px.
- Movimento reduzido, histórico com menos de três capítulos ou janela baixa: sem trilha presa e sem revelação; tudo visível, linha inteira desenhada. Com container ≥ 900 px o trilho vai para o centro e os capítulos alternam de lado.
- Detalhe da edição: painel logo abaixo, aberto por padrão na edição encerrada mais recente. “Ver detalhes da Nª edição” troca a edição, leva a rolagem até o painel (salto quando o trajeto é longo) e move o foco para o título; “Voltar à linha do tempo” devolve o foco ao capítulo.
- Sem edição encerrada: a tela mostra o capítulo em disputa e a mensagem “Nenhuma edição registrada”.
- Movimento só com `transform`/`opacity`, por transição; nada em laço. O modo (preso ou empilhado) é decidido no CSS (`--hof-mode`); o hook só lê, mede no resize e escuta a rolagem enquanto a seção está perto da tela.

### Maiores Campeões

Redesenhada em 09/10/2026 a pedido do usuário: uma galeria de troféus, não um dashboard de estatísticas. A página mostra exclusivamente duplas com título; o histórico por edição continua no Hall da Fama, alcançado por link. Substitui o registro anterior (três contadores no cabeçalho, card “Sua dupla na corrida” e lista “Demais duplas”), que saiu da tela.

- Só campeãs: o ranking completo continua vindo da API e do cálculo central; a página apenas filtra `titles > 0`. Dupla sem título não aparece em lugar nenhum, nem a do próprio jogador. As posições são as de `entry.rank`, sem recálculo nem desempate no frontend.
- Cabeçalho compacto, sem card e sem números: selo “Ranking histórico · Truco do Novo” com a espadilha, `h1` “Maiores Campeões”, uma frase curta e o botão fantasma “Ver o histórico por edição” (`/hall-da-fama`) na linha do título no desktop e abaixo da frase no celular (48 px de altura, largura total). Fecha com um filete de luz laranja→azul que se desenha da esquerda; feixe azul discreto atrás.
- Palco (`.major-gallery` / `.major-stage`): um ambiente único atrás de todas as vitrines — luz quente de cima, vinheta nas bordas e a linha de chão do pódio. Não é card: clareia em cima e se dissolve no fundo embaixo. Intensidades por tema (`--major-*-alpha`). No celular as vitrines usam a largura toda e do palco fica só a luz.
- Pódio: `MajorChampionsPodium` na versão galeria (ver “Maiores Campeões e pódio histórico”): ouro protagonista e centralizado, pratas idênticas lado a lado (empilhadas no celular), 3º lugar neutro.
- “Também levantaram o caneco”: campeãs com `rank` acima de 3. Lista discreta com posição, nome, plaquinhas de edição e contagem; só existe quando há alguma, e não repete ninguém do pódio. Nenhuma campeã some da página.
- “Sua dupla”: selo pequeno e neutro na vitrine ou na fileira, só quando a dupla do jogador é campeã (encontrada pelos nomes dos integrantes; falha na busca de duplas/jogadores não derruba a página). O card “na corrida” não volta.
- Sem nenhuma dupla com título (ou ranking vazio): cabeçalho e o estado vazio “O ranking está começando”, sem palco.
- Movimento, tudo com fim: o palco acende, o filete se desenha, o caneco de ouro sobe e assenta, pratas em cascata, uma varredura de brilho, contagem animada e plaquinhas em sequência. Hover só para ponteiro. Com movimento reduzido tudo aparece no estado final.

## Entrada com cartas (06/10/2026)

`/login` abre em “Quem está entrando para jogar?”: as cartas de truco dos jogadores reais (lista pública `/players/roster`, só id e nome) penduradas num trilho em arco 3D sobre a mesa — adaptação do conceito de “vestiário interativo” enviado pelo usuário, sem copiar o visual. Arrastar/deslizar (com inércia e mola), setas, roda do mouse e teclado navegam; a carta do centro ganha aro laranja. Escolher a carta só identifica: ela vem para a frente girando, aparece “Entrar como Nome” e só então a senha é pedida — nunca há login automático. “Não é você? Entrar com outro usuário” volta à mesma carta; “Ver lista de nomes” e “Área administrativa” continuam disponíveis.

- Carta (`components/login/TrucoPlayerCard`): moldura dourado-laranja, face azul-marinho, valor/naipe de truco, manilha (Zap, Sete Copas, Espadilha, Pica-fumo) e cor própria — tudo derivado do id (`playerCardIdentity`), sem coluna nova no banco. Naipes vermelhos em laranja, pretos em azul.
- Tecnologia: CSS 3D + física própria (`deckMotion`) e luz ambiente em WebGL puro (`tableLight`), sem biblioteca. Three.js mínimo mediria 133 KB gzip (WebGPU 215 KB, React Three Fiber 248 KB) para desenhar retângulos com texto; o CSS mantém nomes nítidos e acessíveis.
- Níveis: `full` (arco, balanço, reflexo que segue o mouse, luz WebGL só com GPU real e no tema escuro, desligada se derrubar o FPS), `lite` (aparelho fraco: sem luz WebGL, menos cartas) e `reduced` (prefers-reduced-motion: fila plana sem rotação nem mola). `?deck=` força um nível só no build de desenvolvimento.

## Abertura da edição (redesenho de 09/10/2026)

O hero de `/abertura` foi redesenhado a pedido do usuário para ser uma das telas mais bonitas do projeto: memorável e premium, sem exagero. Não é um card: é um palco iluminado — feixe azul vindo de cima à esquerda e calor laranja atrás do caneco — que se dissolve no fundo da página, sem malha nem grade. “Quem já fez história” continua logo abaixo, na mesma margem, ligado pelo filete laranja→azul com a espadilha. Segue o tema escolhido; a intensidade das luzes e a cor das sombras são ajustadas por tema (`--opening-*-alpha` em `OpeningPage.css`), porque no off-white a luz precisa de mais tinta e a sombra é azul-marinho.

- Coluna de texto: selo “5ª Edição · Truco do Novo” com a espadilha acima do título; um único `h1` com a frase “Bora fazer história e levar esse caneco para casa?” (“caneco” em laranja sólido); parágrafo curto; CTA laranja “Entrar na edição atual” e botão fantasma de borda azul “Conhecer a história do campeonato”. As ações ficam lado a lado só quando a coluna comporta; empilhadas têm a mesma largura.
- Palco (`components/opening/OpeningStage`): o caneco é o protagonista (cerca de 30% da largura útil no desktop, metade no celular), sobre a mesa com foco de luz, poça de luz, reflexo e sombra de contato. As três manilhas — 7 de copas, zap e espadilha — formam um leque que sai de trás da boca da taça, em profundidades diferentes (CSS 3D). Os pés das cartas ficam escondidos atrás da taça, acima das alças: nenhuma carta cruza uma alça e toda carta mostra o canto (valor + naipe) e o naipe central. Tudo é medido em `--u` (1/320 da largura do caneco, as mesmas coordenadas do SVG), que por sua vez vem de `cqi` da página.
- Caneco (`OpeningTrophy`): SVG, sem imagem nem biblioteca 3D. Metal em camadas — gradiente cilíndrico, oclusão sob o aro e no fundo da taça, reflexo frio azul, especular nítido, luz de recorte, espadilha gravada, pedestal marinho com “5ª EDIÇÃO”. Também é o caneco do campeão no mata-mata (84–92 px): ali não há laço nem paralaxe.
- Entrada (~1,6 s, uma vez): foco e halo acendem → cartas dadas uma a uma, virando do verso para a face → caneco sobe saindo do desfoque → luz varre o metal → selo, título linha a linha, texto e ações por último.
- Luz dinâmica (ponteiro fino): a cena inclina em 3D seguindo o mouse, com cartas e caneco em profundidades diferentes, e o halo e o especular do metal se deslocam de leve. Só custom properties (`--px`/`--py`) + `transform`.
- **Exceção aprovada à regra “nada em laço” (09/10/2026):** depois da entrada, SOMENTE o caneco flutua (≈4 px, ciclo de 6 s) e o halo respira (opacidade/escala sutil). Esse ambiente pausa quando o palco sai da tela e quando a aba fica oculta, e não existe com `prefers-reduced-motion`. Nenhum outro elemento da abertura — nem de qualquer outra tela — fica em laço. A flutuação mora no palco, não no `OpeningTrophy`, para não vazar para o mata-mata.
- CTA: brilho que varre e seta que avança no hover, afunda no clique, foco visível; o hero se recolhe em 300 ms e só então a rota troca (imediato com movimento reduzido).
- Movimento reduzido: tudo aparece parado e completo (cartas já com a face para cima, caneco no lugar), sem flutuação nem paralaxe.
- Celular: caneco grande no topo com o leque, texto centralizado, CTA de largura total; selo, título e CTA cabem na primeira tela em 390×844.

## Navegação e entrada

Menu: Início, Hall da Fama, Maiores Campeões, Minha Dupla, Grupos, Jogos, Mata-mata, Perfil. (Mata-mata entrou a pedido do usuário em 07/10/2026; no celular fica em “Mais”.)

`/abertura` aparece ao entrar pela raiz/login, uma vez por sessão de navegador e por conta de jogador. O CTA marca a abertura como vista e segue para `/inicio`. Links diretos às telas continuam funcionando; “Rever abertura” fica na Home. Sem item extra no menu.

## Dados e comportamento

Não criar histórico, títulos ou estatísticas fictícios. Estados sem dados mostram informação ausente, não números inventados. Resultados usam `pointsForResult`; zonas usam `qualificationForPosition`. A classificação descrita é a zona atual, não uma garantia de qualificação antes do encerramento da fase.

Filtros de Jogos começam em Meus Jogos (dupla, não indivíduo). Grupos abre no grupo da dupla e permite consultar o outro. Manter permissões e confirmação de correção de resultado. Ordenar pelo número de fila disponível, com a ordem original como alternativa.

## Responsividade, interação e movimento

Cards de jogo usam linhas verticais para nomes não ficarem comprimidos. Somente controles compactos podem rolar horizontalmente em telas estreitas. Respeitar `prefers-reduced-motion`; animações curtas indicam troca de grupo/edição, mudança de posição ou feedback de interação. Evitar movimento contínuo competindo com a leitura; a única exceção aprovada (09/10/2026) é o ambiente da abertura — o caneco que flutua e o halo que respira, pausados fora da tela ou com a aba oculta e desligados com `prefers-reduced-motion` (ver “Abertura da edição”).

A pedido do usuário (06/10/2026), toda tela tem animação de entrada: a raiz de cada página usa `.page-enter` e os blocos entram em cascata. O sistema mora em `frontend/src/styles/motion.css`: só CSS, só `transform`/`opacity`, keyframes apenas com `from` e preenchimento `backwards`, para nenhum bloco reter `transform` e deslocar modais fixos. Estados novos de página (vazio, erro com cabeçalho) também precisam de `.page-enter`; o teste "entra com animação" em `e2e/championship.spec.ts` cobre as rotas de jogador e admin.

## Limites desta rodada

Sem alteração de esquema, dados ou autenticação do Supabase. Sem commit e sem deploy. O projeto usa dados de teste na edição atual; preservá-los. O formato (cinco duplas por grupo) e as zonas vigentes ficam no código compartilhado (`TEAMS_PER_GROUP`, `qualificationForPosition`); telas não repetem esses números. Referências anteriores de layout não disponíveis no turno não devem ser consideradas imagens verificadas.
