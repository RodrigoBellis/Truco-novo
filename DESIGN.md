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

- `TeamIdentityCard`: escudo na cor da dupla, nome, integrantes (você/parceiro), força, grupo, posição, zona atual e aprovação. Os números da campanha ficam em `TeamCampaignStats`.
- `TeamCampaignStats`: pontos, vitórias, derrotas e saldo de sets em um único painel; sem classificação mostra travessões.
- `TeamCrest`: escudo/marca de cor da dupla, usado no card da dupla, no próximo confronto, nos jogos e na classificação.
- `TeamStrength`: escala real de uma a cinco estrelas, com texto e rótulo acessível.
- `MatchCard`: uma dupla por linha, sets e pontos associados a cada lado, resumo do placar e ações permitidas.
- `StandingsTable`: tabela completa no desktop; estatísticas secundárias e situação junto à dupla no celular.
- `MajorChampionsPodium`: ranking calculado pelo serviço central, com todos os empates preservados. 1º lugar em faixa azul de largura total com troféu e contagem grande; demais posições em cards lado a lado. Também aparece na abertura.
- `TournamentHistory`: seletor de edições em cards, destaque da edição (medalha azul com troféu, campeões, vice/placar e notas quando registrados, total de títulos da dupla no histórico) e linha do tempo com trilho. A edição escolhida é controlada pela página, que repete o campeão na placa do cabeçalho.

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

Quatro blocos, nesta ordem: card da dupla, próximo confronto, resumo da campanha e banner azul/laranja de incentivo ao título. Sem atalhos repetindo o menu; “Rever abertura” fica no cabeçalho. Blocos de destaque usam `.premium-panel`.

### Hall da Fama

Histórico por edição; o ranking acumulado continua só em Maiores Campeões, alcançado por link. Cabeçalho na mesma faixa azul com brilho laranja do banner da Home (igual nos dois temas), sem malha nem textura. Sem dados inventados: edição sem dupla registrada mostra “Dupla não registrada”, e o resumo vem das notas ou de uma frase montada com os dados reais.

### Maiores Campeões

Ranking acumulado; o histórico por edição continua no Hall da Fama, alcançado por link. Cabeçalho na faixa azul com três números reais (títulos, duplas campeãs, duplas no ranking). “Sua dupla na corrida” mostra posição, títulos e distância até o topo quando a dupla do jogador é encontrada no ranking pelos nomes dos integrantes; sem correspondência, o bloco não aparece. Em “Todas as duplas”, o mapa de títulos tem uma casa por edição (até 12), acesa em laranja nas conquistas.

## Navegação e entrada

Menu: Início, Hall da Fama, Maiores Campeões, Minha Dupla, Grupos, Jogos, Perfil.

`/abertura` aparece ao entrar pela raiz/login, uma vez por sessão de navegador e por conta de jogador. O CTA marca a abertura como vista e segue para `/inicio`. Links diretos às telas continuam funcionando; “Rever abertura” fica na Home. Sem item extra no menu.

## Dados e comportamento

Não criar histórico, títulos ou estatísticas fictícios. Estados sem dados mostram informação ausente, não números inventados. Resultados usam `pointsForResult`; zonas usam `qualificationForPosition`. A classificação descrita é a zona atual, não uma garantia de qualificação antes do encerramento da fase.

Filtros de Jogos começam em Meus Jogos (dupla, não indivíduo). Grupos abre no grupo da dupla e permite consultar o outro. Manter permissões e confirmação de correção de resultado. Ordenar pelo número de fila disponível, com a ordem original como alternativa.

## Responsividade, interação e movimento

Cards de jogo usam linhas verticais para nomes não ficarem comprimidos. Somente controles compactos podem rolar horizontalmente em telas estreitas. Respeitar `prefers-reduced-motion`; animações curtas indicam troca de grupo/edição, mudança de posição ou feedback de interação. Evitar movimento contínuo competindo com a leitura.

A pedido do usuário (06/10/2026), toda tela tem animação de entrada: a raiz de cada página usa `.page-enter` e os blocos entram em cascata. O sistema mora em `frontend/src/styles/motion.css`: só CSS, só `transform`/`opacity`, keyframes apenas com `from` e preenchimento `backwards`, para nenhum bloco reter `transform` e deslocar modais fixos. Estados novos de página (vazio, erro com cabeçalho) também precisam de `.page-enter`; o teste "entra com animação" em `e2e/championship.spec.ts` cobre as rotas de jogador e admin.

## Limites desta rodada

Sem alteração de esquema, dados ou autenticação do Supabase. Sem commit e sem deploy. O projeto usa dados de teste na edição atual; preservá-los. Regras de cinco duplas por grupo e suas zonas vigentes continuam no código compartilhado. Referências anteriores de layout não disponíveis no turno não devem ser consideradas imagens verificadas.
