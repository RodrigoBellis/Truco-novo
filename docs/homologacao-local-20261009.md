# Homologação local da 5ª edição — 09/10/2026

Decisão do organizador: homologar no PostgreSQL 17 já instalado na máquina, não no Supabase. O caminho indireto de escrita descrito em [homologacao-isolamento-20261009.md](homologacao-isolamento-20261009.md) foi confirmado no catálogo real e impede comprovar o isolamento dentro do projeto compartilhado sem alterar privilégios de outro aplicativo.

Nada foi criado nem alterado no Supabase. As 12 tabelas `public.truco_*` tinham as mesmas contagens e os mesmos hashes às 19:34 UTC (antes) e às 20:14 UTC (depois); o schema `homologacao` e o papel restrito continuam inexistentes lá, e a última migration remota é `20261005232535`.

## O que é

| Peça | Arquivo |
| --- | --- |
| Cluster descartável em `127.0.0.1:55450` | `backend/scripts/homologacao-local.mjs` (`up`, `down`, `destroy`, `status`) |
| Papéis e `auth.users`/`auth.uid()` mínimos | `supabase/homologacao/00_supabase_stubs.sql` |
| Tabelas, índices, funções, gatilhos, grants e RLS de `public.truco_*`, copiados do catálogo real | `supabase/homologacao/01_schema_truco_remoto.sql` |
| Dados fictícios (20 jogadores, 10 duplas, administrador, 4 edições antigas) | `supabase/homologacao/02_seed_ficticio.sql` |
| Modo do backend | `TRUCO_HOMOLOGACAO=1`, `npm run dev:homologacao --workspace backend` |
| Cliente SQL no lugar do supabase-js | `backend/src/data/homologation/pgSupabaseShim.ts` |
| Login fictício | `backend/src/data/homologation/fictitiousAuth.ts` |
| Campeonato pela API, duas instâncias | `backend/scripts/homologacao-campeonato-api.mjs` |
| Campeonato pelos botões | `npm run test:homologacao -- --project=chromium` (ou `mobile-chromium`) |

Depois do schema remoto, o script aplica sem alteração as quatro migrations pendentes: `202610070001`, `202610070002`, `202610090001` e `202610090002`. O backend usa o repositório real (`TrucoRepository`) e as RPCs reais; a conexão assume `service_role`, como em produção.

O modo recusa subir com `NODE_ENV=production`, com `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` no processo, junto com o modo ensaio, ou com banco fora de `127.0.0.1`. Antes da primeira consulta ele confere o marcador `homologacao.ambiente`, a identidade restrita e a ausência dos schemas de plataforma do Supabase. O driver `pg` só é carregado nesse modo.

## O que não comprova

- PostgREST e a chave `service_role` reais: o cliente de homologação fala SQL direto.
- Supabase Auth real: as contas são fictícias, com token assinado por segredo sorteado a cada subida.
- Supabase Realtime: não é emulado.
- Storage de avatares.
- A aplicação das migrations no banco oficial, com os dados oficiais.

## Como repetir

```
node backend/scripts/homologacao-local.mjs up
npm run test:homologacao -- --project=chromium
npm run test:homologacao -- --project=mobile-chromium
```

Para o roteiro pela API, subir duas instâncias (`npm run dev:homologacao --workspace backend` e a mesma com `PORT=3102`) e rodar `node backend/scripts/homologacao-campeonato-api.mjs [semente]`. Não rodar junto com `npm run test:rehearsal`: os dois usam as portas 3101 e 5183.

## Resultados da última rodada (09/10/2026, antes do commit)

| Verificação | Resultado |
| --- | --- |
| Typecheck, lint e build dos três workspaces | PASSOU |
| Unitários do backend | PASSOU, 121/121, 0 ignorados |
| E2E padrão desktop e celular (API simulada) | PASSOU, 100 + 100; os 5 ignorados de cada projeto são o roteiro de ensaio, que roda nas configurações abaixo |
| Ensaio em memória, desktop e celular | PASSOU, 5/5 em cada, 27 partidas pelos botões |
| Homologação pelos botões, desktop e celular (PostgreSQL local, schema real) | PASSOU, 5/5 em cada, 27 partidas |
| Campeonato pela API, duas instâncias, sementes 20261025, 7, 424242 e 99 | PASSOU, 62/62 em cada |
| Empate absoluto: montar, decidir, e corrigir em vez de decidir | PASSOU, 5 + 7 + 2 verificações |
| Quatro migrations sobre banco com 20 jogos e 5 placares | PASSOU, dados idênticos antes e depois |
| Reversão das quatro migrations e reaplicação | PASSOU, schema idêntico ao retrato remoto |
| 19 telas em 1440, 1024, 390 e 320 px, temas claro e escuro | PASSOU, sem rolagem horizontal nem erro de console |
| Unitários de frontend e shared | NÃO TESTADO: não existem |
| PostgREST e `service_role` reais, Supabase Auth, Realtime, Storage | NÃO TESTADO: ver `docs/plano-producao-5a-edicao.md` |
| Migrations no banco oficial | NÃO APLICADAS |

Na primeira passada desta rodada o E2E padrão falhou em dois pontos, corrigidos antes do commit: a tela de mata-mata do administrador quebrava quando `/bracket/status` vinha sem `anomalies`, e o teste da abertura com movimento reduzido media as animações num único instante.
