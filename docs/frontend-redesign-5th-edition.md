# Melhorias de frontend — 5ª Edição

Rodada concluída em 05/10/2026. Direção de design registrada em `DESIGN.md` e referenciada por `AGENTS.md`.

## 1. Telas melhoradas

Abertura (nova), Início, Minha Dupla, Grupos, Jogos, Hall da Fama e Maiores Campeões. Navegação, botões, badges, loading e superfícies receberam ajustes compartilhados de identidade visual.

## 2. Componentes principais

- `TeamIdentityCard`: novo card compartilhado por Home e Minha Dupla.
- `TeamStrength`: novo indicador SVG de força, com escala textual acessível; informação ausente aparece como “Força a definir”.
- `MatchCard`: confronto reorganizado em duas linhas, com sets e pontos por dupla.
- `StandingsTable`: tabela, zonas, dados compactos no mobile e realce da dupla autenticada.
- `TournamentHistory`: apresentação por edição, detalhes da final e linha histórica.
- `MajorChampionsPodium`: destaque reutilizado na abertura e no ranking; respeita posições/empates reais.
- Navegação lateral, barra mobile, botões, badges e loading refinados.

Os componentes antigos de ranking histórico permanecem no projeto para eventual reaproveitamento; o ranking acumulado foi removido apenas da composição do Hall da Fama.

## 3. Direção visual

Azul para navegação/campanha, laranja para conquista/chamada de abertura, branco/off-white para superfícies. Tipografia forte, números tabulares, ícones SVG, sombras suaves e bordas finas. Removidos ruído de fundo e gradientes de texto do Hall. Tema claro padrão; preferência alternativa preservada em azul noturno, com textos mais legíveis.

## 4. Home

Identificação da dupla, integrantes/parceiro, força, grupo, aprovação, posição, pontos, zona atual, jogos, vitórias, derrotas e saldo de sets. Atalhos para jogos/classificação/histórico. Próximo confronto obtido das partidas pendentes reais da dupla, sem concluir que a campanha terminou apenas porque a fila não apresentou um adversário. Serviços auxiliares indisponíveis geram aviso de atualização, sem estatísticas fictícias.

## 5. Jogos

Uma dupla por linha, avatares, nomes, força, badge de própria dupla, sets e pontos associados a cada lado. Cabeçalho com número, grupo/rodada e situação. Resumo do placar e formulário de resultado no próprio card. A fila disponível orienta a ordenação; a ordem original é a alternativa.

Meus Jogos continua inicial e considera a dupla compartilhada. Filtros A/B/Todos e Todos/Próximos/Finalizados preservados. Insights do próximo adversário aparecem em Meus Jogos. Permissões continuam restritas à própria dupla; jogadores sem dupla também não recebem ações em vagas abertas. Correção continua exigindo confirmação e usando pontuação central 3/2/1/0.

## 6. Grupos

Abre no grupo da dupla autenticada, permite consultar ambos e identifica claramente “Seu grupo”. Ao consultar o outro, informa onde está sua dupla. Cabeçalho azul, força, estatísticas e pontos mais legíveis; realce azul e badge “Sua dupla”. Zonas verde/amarela/vermelha preservadas pelo código compartilhado, com rótulos textuais no desktop/mobile. Alternância por teclado e transição curta entre grupos.

## 7. Hall da Fama

Foco exclusivo em edições históricas: ano, nome, campeões, vice-campeões/placar quando registrados e notas reais. Seletor de edições e linha histórica. Ranking acumulado removido dessa página, com link para Maiores Campeões disponível ao jogador autenticado. Nenhuma edição, título ou placar histórico foi criado.

## 8. Maiores Campeões

Pódio com protagonista azul, troféus, quantidade de títulos e edições conquistadas. Ranking completo mantido, incluindo duplas sem títulos. Empates recebem a mesma posição e destaque. Eliminada a repetição visual de “0 títulos”.

## 9. Abertura

Rota protegida `/abertura`, com chamada “Bora fazer história e levar esse caneco para casa?”, troféu, maiores campeões reais e CTA “Entrar na edição atual”. Aparece na entrada pela raiz/login uma vez por sessão de navegador e por conta de jogador. O CTA segue para `/inicio`; a Home permite rever a abertura. Sem item extra no menu. Falha/ausência do ranking não impede continuar. Rotas diretas e fluxo de criação de senha continuam disponíveis.

## 10. Typecheck

`npm run typecheck`: aprovado para shared, backend e frontend; saída 0.

## 11. Lint

`npm run lint`: aprovado; saída 0. Conferência adicional de whitespace aprovada com configuração que reconhece CRLF do ambiente Windows.

## 12. Testes

- `npm test`: 27/27 aprovados (regras, pontuação, permissões, histórico, isolamento de autenticação e simulação).
- `npm run test:e2e`: 40/40 aprovados, 20 cenários executados em Chromium desktop e mobile.
- Cobertura inclui cadastro administrativo, dupla/parceiro/fotos, lançamento/correção, grupos A/B iniciais, teclado, todos os filtros, placar/pontos, permissões, vagas abertas, abertura, ranking/empates, histórico real, sessão renovada e rotas antigas.
- Autenticação real e leitura das sete telas verificadas via localhost com frontend conectado ao backend/Supabase. Desktop 1440 px, mobile 390 px e 320 px: 21 verificações de página sem alerta de carregamento, erro de JavaScript ou overflow horizontal da página.

Resultados de gravação foram testados com API isolada do Playwright; nenhuma partida real foi alterada pela validação. Isso preserva os dados de teste da edição atual.

## 13. Build

`npm run build`: aprovado para shared, backend e frontend; saída 0. Vite produziu os arquivos locais de produção. Sem publicação.

## 14. Pendências e limites

Nenhuma pendência funcional identificada nesta rodada. A identidade utiliza a direção azul/laranja solicitada, sem alegar reprodução de um manual de marca ou imagem não disponível. A conferência mobile foi feita em Chromium com viewport/dispositivo emulado; não substitui uma avaliação manual em aparelhos físicos.

Não houve mudança de esquema ou dados de campeonato no Supabase. Funcionalidades, menu de sete itens e redirecionamentos antigos foram preservados. Não foi feito commit nem deploy.

Acesso local: `http://localhost:5173/` ou `http://localhost:5173/abertura` após autenticar. Backend utilizado pelo proxy: porta 3001.

## Correção de cores após feedback do usuário

A distribuição anterior foi substituída por fundo neutro off-white, sidebar marinho, cards e tabelas brancos, cabeçalhos com azul muito suave e ações/seleções laranja. Azul permanece nos links e detalhes; estrelas usam laranja/dourado. As zonas de classificação ficam nos badges verde, amarelo e vermelho, com rótulos.

Grupos agora tem card de grupo branco, tabela com linhas brancas e separadores suaves. A dupla autenticada recebe faixa lateral laranja fina, bordas discretas e badge claro, sem preencher a linha inteira de azul. Home, abertura, Hall, Jogos e pódio também tiveram as superfícies azuladas reduzidas.

Validação desta correção: typecheck, lint, build e 40/40 testes de navegador aprovados. Conferência visual autenticada em desktop e mobile, com auditoria dos pares de contraste de textos/controles principais. Uma captura inicial excedeu o tempo de carregamento em Grupos; a nova consulta carregou normalmente com os dados reais, sem alterações no backend.

A direção atual está registrada em DESIGN.md. Sem commit ou deploy.

## Fundo da referência solicitado em 05/10/2026

Experimento posteriormente rejeitado pelo usuário; foi desfeito conforme a seção seguinte.

Foi reproduzido somente o fundo da referência enviada pelo usuário, inspecionada no navegador: base creme `oklch(0.985 0.012 88)` e linhas diagonais a 45°, de 1 px a cada 14 px, com 7% de opacidade, nos primeiros 420 px da página. A tinta das linhas foi adaptada ao azul do Truco. Cards e tabelas continuam brancos, navegação marinho e ações laranja.

Implementação compartilhada em `styles/variables.css` e `styles/global.css`, sem ativos remotos, novas dependências, animação contínua ou camadas sobre controles. O tema alternativo mantém seu fundo próprio. Direção e referência documentadas em DESIGN.md, já referenciado pelo AGENTS.md.

Typecheck, lint e build aprovados. Testes de regras: 27/27; testes de navegador em desktop/mobile: 40/40. Conferência autenticada das sete telas em 1440, 390 e 320 px: 21 leituras sem alertas de carregamento, erros de JavaScript ou overflow horizontal; pares de contraste dos controles principais aprovados. Capturas de Grupos em desktop/mobile inspecionadas visualmente. Nenhuma alteração de dados, permissões, rotas ou regras nesta correção. Sem commit ou deploy.

## Restauração do fundo preto a pedido do usuário

Removidos o fundo creme e a trama diagonal. Restauradas as superfícies preto/grafite da versão anterior (`#080a10`, `#0f1219`, `#151925`), preservando os componentes e as funcionalidades atuais. O tema escuro passa a ser o padrão. Uma atualização única da preferência de aparência aplica o fundo restaurado também a navegadores com o tema claro anterior salvo; escolhas posteriores pelo seletor continuam persistindo. Nenhum dado de sessão/autenticação é alterado.

Typecheck, lint, build e 27 testes de regras aprovados. Conferência autenticada de Início, Grupos e Jogos em 1440, 390 e 320 px confirmou tema escuro, fundo preto e ausência de listras, alertas e overflow horizontal; controles principais sem falhas de contraste. Teste existente da arte de login atualizado para verificar o novo padrão, a migração da preferência anterior e a persistência da alternância.

Testes de navegador: 38 cenários passaram na primeira execução; os dois cenários de tema ainda esperavam o padrão claro anterior. Após atualizar a expectativa para a direção solicitada, ambos passaram na repetição em desktop/mobile, incluindo a persistência após recarregar. Sem falhas pendentes.

Direção atual registrada em DESIGN.md. Sem commit, deploy ou alteração no Supabase.
