# Homologação no projeto atual — análise prévia de 09/10/2026

Atualização após a autorização do papel: a auditoria adversarial confirmou um caminho indireto por grants herdados e trigger SECURITY DEFINER. A criação continua interrompida; detalhes e comparação das tabelas oficiais em [homologacao-isolamento-20261009.md](homologacao-isolamento-20261009.md). A aprovação foi recebida, mas a condição técnica de isolamento não passou.

Status: **execução remota interrompida antes de qualquer alteração**. Foram feitas somente consultas de catálogo, consulta do projeto e leitura do histórico de migrations. Nenhum schema, papel, conta, tabela ou dado fictício foi criado. Nenhuma migration oficial foi aplicada.

## Resultado da análise real

O projeto consultado foi `sfllpogpuqukhjddwiel`, nome CRM, PostgreSQL 17, estado ACTIVE_HEALTHY. O schema `homologacao` ainda não existe. O histórico remoto termina, para Truco, em `harden_truco_rpc_grants` (`20261005232535`). As migrations locais de cadeado, integridade dos grupos, unicidade e progressão transacional não aparecem no histórico remoto. A estrutura real também não tem as colunas locais `results_locked`, `progression_revision` e `progression_pending`.

Há dois impedimentos confirmados:

1. O backend atual recebe uma `service_role` com `BYPASSRLS` e permissões de escrita nas doze tabelas oficiais. Configurar o schema no cliente não retira esses privilégios. Não é aceitável colocar essa credencial no processo de homologação e chamá-lo de isolado.
2. `auth.users` tem os triggers `on_auth_user_created` → `public.handle_new_user()` e `truco_trg_auth_user_created` → `public.truco_fn_handle_new_user()`. A segunda função executa `INSERT INTO public.truco_audit_log` para cada usuário criado, incluindo o e-mail. Portanto, criar contas fictícias no Supabase Auth alteraria uma tabela oficial. Não foi necessário inspecionar a função de outro aplicativo: o vínculo Truco já demonstra a incompatibilidade.

As FKs oficiais de perfis e ator da auditoria também apontam para `auth.users`. Copiar essas FKs tornaria a homologação dependente do Auth compartilhado. Elas precisam ser substituídas por identidades exclusivamente locais ao schema de teste; isso é uma diferença deliberada de cobertura, não uma réplica do Auth real.

O schema `public` concede USAGE a PUBLIC. Existem funções de outras aplicações com EXECUTE para PUBLIC, algumas SECURITY DEFINER. Privilégios são aditivos: um REVOKE dirigido apenas ao papel novo não cancela uma permissão recebida de PUBLIC. A análise dos privilégios efetivos é um requisito de aprovação técnica; se exigir revogar grants de objetos oficiais, interromper novamente. Não alterar esses objetos para acomodar os testes.

## Desenho proposto

Manter `homologacao` privado, sem exposição na Data API, sem alteração de publicação Realtime, sem contas novas em `auth.users` e sem acesso ao bucket `avatars`. A aplicação local de homologação trabalha com conexão SQL de privilégio mínimo. Não usa a chave administrativa do projeto em tempo de execução.

| Camada | Produção | Homologação proposta |
| --- | --- | --- |
| Banco | `public.truco_*` | `homologacao.truco_*` |
| Acesso do backend | Cliente atual, sem mudança nesta rodada | Conexão SQL exclusiva com papel restrito |
| Identidade dos jogadores | Supabase Auth oficial | Contas/sessões fictícias locais à homologação |
| Hall da Fama | Histórico oficial | Endpoint do backend restrito, histórico fictício |
| Atualização das telas | Integração atual | Polling controlado ou eventos do backend, sem modificar publicação Supabase |
| Upload de avatar | Bucket atual | Desabilitado nesta etapa |
| Configuração | Configuração atual preservada | Arquivo local separado, porta/origin e armazenamento de sessão distintos |

A escolha central será `TRUCO_ENVIRONMENT=production|homologacao`. Na homologação, o backend exige a conexão restrita e recusa iniciar se encontrar credencial `service_role`, modo ensaio em memória, schema diferente de `homologacao`, identidade de banco privilegiada ou privilégios oficiais incompatíveis. Não aceita schema por parâmetro, header, botão ou usuário. A produção mantém seu contrato de configuração; nenhuma troca automática de ambiente.

O adaptador de persistência deve manter o contrato `Store` e as regras `computeGroupStandings`/`planKnockoutSync` existentes. O frontend de homologação deve usar seu backend para histórico, contas e atualizações; selecionar somente o schema no cliente Supabase atual não resolve o problema.

Há `psql` já instalado no computador. Não há driver SQL de Node declarado no repositório nem credencial de conexão SQL restrita no ambiente atual. A API Supabase existente usa PostgREST. A implementação do adaptador SQL e sua forma de conexão precisam ser definidas antes da execução; não instalar driver ou ferramenta silenciosamente. O `psql` existente permite testes SQL reais, mas sozinho não demonstra um backend integrado completo.

### Papel de execução a autorizar

Criar exclusivamente `truco_homologacao_runtime`, sem herdar papéis oficiais. Essa criação é uma alteração do catálogo de permissões compartilhado e, por isso, ainda precisa de aprovação explícita conforme o pedido do usuário.

Forma proposta, **não executada**:

```sql
CREATE ROLE truco_homologacao_runtime
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;
```

A senha é atribuída por canal administrativo seguro, sem literal em migration, argumento de processo, arquivo rastreado ou relatório. O processo local recebe apenas essa credencial. Não conceder membership em `postgres`, `service_role`, `authenticated`, `anon`, `authenticator` ou papéis de outros aplicativos. Não conceder propriedade do schema/tabelas ao papel de execução, CREATE, TRUNCATE ou execução de rotinas administrativas de reset. A instalação usa o canal administrativo apenas para DDL revisado; o campeonato não roda por ele.

A conexão precisa validar TLS, hostname/certificado e referência do projeto. Timeouts de query/lock ficam restritos às suas sessões, sem `ALTER DATABASE` nem mudança em configurações de papéis oficiais. A aprovação do papel não autoriza instalar dependências; a ausência do adaptador Node continua sendo uma etapa técnica a resolver com os recursos existentes ou por consulta separada.

Grants novos ficam restritos ao schema de homologação: USAGE no schema, SELECT nas entidades necessárias e EXECUTE nas RPCs explicitamente permitidas. A preferência é gravar por RPCs de escopo fechado, com dono de privilégio mínimo também dedicado, se isso for necessário para aplicar RLS e validações sem grants diretos de escrita. Esse segundo papel, caso usado, também requer aprovação e auditoria de privilégios. Não contornar RLS com funções SECURITY DEFINER pertencentes a `postgres`.

RPCs SECURITY INVOKER também são possíveis, com grants mínimos de escrita e políticas RLS correspondentes, mantendo a identidade/autorização no backend e revalidando o ator na transação. A revisão deve escolher uma única variante e testar acesso direto; não prometer que um papel compartilhado de servidor é a identidade RLS individual dos vinte jogadores.

## Estrutura das entidades

Todas as FKs abaixo são qualificadas explicitamente com `homologacao`; não reutilizar FKs, tipos ou funções oficiais.

| Tabela | Relações e integridade necessárias |
| --- | --- |
| `truco_championships` | Edição única; cadeado; revisão; marcador persistido de avanço; somente uma edição ativa |
| `truco_players` | Vinte pessoas fictícias; UUIDs novos; sem avatar ou dado pessoal oficial |
| `truco_profiles` | Identidade fictícia própria; jogador único; papel atual; sem FK para `auth.users` |
| `truco_groups` | FK para campeonato; label A/B único por edição |
| `truco_teams` | FK para campeonato/grupo; status; cinco aprovadas por grupo |
| `truco_team_memberships` | FK para edição, dupla, grupo e dois jogadores locais; parceiros distintos; participação única nas duas posições |
| `truco_team_members` | Par histórico local; posições 1/2 e jogador únicos por dupla; preservado ao encerrar |
| `truco_matches` | FK para edição, grupo e duas duplas locais; adversários diferentes; pares de grupo únicos; score válido e status coerente |
| `truco_bracket_matches` | Sete posições; FK para edição, fontes, duplas e partida locais; posição e ligação únicas |
| `truco_standings_overrides` | FK para edição, grupo, dupla e ator local; desempate consistente |
| `truco_history` | FK para edição, campeão e vice locais; edição única; final conferida antes do título |
| `truco_audit_log` | Ator/perfil e campeonato locais; somente eventos fictícios |
| Contas e sessões locais | Senhas derivadas com algoritmo adequado; tokens opacos/expiráveis; logout/revogação; pertencimento exclusivo à homologação |

Oito enums próprios: `truco_bracket_round`, `truco_bracket_slot_type`, `truco_championship_status`, `truco_draw_status`, `truco_match_stage`, `truco_match_status`, `truco_team_status`, `truco_user_role`. Defaults usam funções seguras do catálogo, nunca sequences ou funções oficiais. A repescagem mantém o mapeamento de `oitavas` para o contrato atual.

Não usar `LIKE INCLUDING ALL` como prova de clonagem. Não gerar migrations por substituição de `public` em texto SQL. Produzir DDL explícito a partir do catálogo consultado e das regras locais; revisar diferenças intencionais, incluindo a ausência do Auth compartilhado.

## Funções, triggers e RLS

- Funções próprias para participação, capacidade 10/5, integridade de grupos, atualização de timestamps e auditoria.
- `homologacao.truco_rpc_record_match_result_v2`: bloqueio da edição; revisão atual; perfil, cadeado e dupla revalidados no instante da escrita; placar/auditoria atômicos e idempotentes.
- `homologacao.truco_rpc_apply_knockout_plan`: plano inteiro transacional; validação de vínculos locais; pares, título e fase publicados juntos; preservação dos históricos locais anteriores.
- Triggers próprios de revisão e pendência; advisory lock exclusivo, por exemplo `truco:homologacao:active-edition`, distinto da chave oficial.
- RLS em todas as tabelas; nenhum grant para `anon`/`authenticated`/`service_role` por conveniência. Políticas correspondem ao papel SQL e ao modelo de acesso escolhido, com USING/WITH CHECK apropriados.
- Search path fechado, relações explicitamente qualificadas, EXECUTE revogado de PUBLIC nos objetos novos. Não chamar RPCs oficiais, Auth ou Storage.
- Auditoria de dependências de FK, tipos, defaults, funções, triggers e políticas, incluindo revisão do corpo de PL/pgSQL/SQL dinâmico: o catálogo de dependências sozinho não captura todas as referências textuais.
- Auditar também chamadas encadeadas de funções SECURITY DEFINER acessíveis por PUBLIC. Uma função desconhecida não deve ser executada como investigação. Se essas permissões herdadas exigirem mudanças oficiais para limitar a credencial, parar e apresentar o impedimento.

## Dados, testes e limites

Gerar UUIDs novos e somente nomes como Jogador Teste 01–20, Dupla Teste 01–10, administrador fictício separado e uma edição 5 de homologação. Dois grupos de cinco duplas; os vinte jogos iniciais surgem pelas regras existentes. Nenhuma leitura de jogadores reais é necessária para seed.

Antes de seed ou resultado, verificar identidade SQL, schema e privilégios efetivos; registrar contagens e hashes agregados das doze tabelas oficiais, sem guardar conteúdo pessoal. Fazer a comparação em janela controlada: alteração simultânea legítima da produção precisa ser distinguida de escrita do teste. Igualdade dos hashes é evidência complementar, não substitui a barreira de permissões.

Testes negativos oficiais usam verificação de ACL e tentativa sem linha-alvo: **não tentar atualizar uma linha real para provar que a proteção funciona**. Recusar qualquer escrita ou RPC oficial pelo papel de execução. Não chamar funções oficiais de efeito desconhecido.

Executar um campeonato completo com 20 grupos embaralhados + 2 repescagens + 2 quartas + 2 semifinais + 1 final. Conferir classificação independentemente, nascimento de cada fase, campeão único, par histórico, Hall e Maiores Campeões locais. Testar cadeado, outsider, jogador atual, troca de perfil na fila, correções permitidas/recusadas, score inválido, repetição idêntica, duas instâncias backend, revisão concorrente e recuperação após reinício/resposta perdida. GET/refresh não modifica dados.

Limitar inicialmente a duas conexões concorrentes, uma competição por execução, tempos máximos de query/lock e polling espaçado. Parar em erro de autorização, dependência oficial, divergência inexplicada no snapshot ou pressão no projeto. Supabase Auth e Supabase Realtime não ficam validados por autenticação local/polling.

## Migrations e reversão

Após aprovar o limite de permissões/conexão, preparar arquivos versionados exclusivamente de homologação em `supabase/migrations/`. Não usar `db push` com toda a pasta: contém migrations oficiais pendentes. Aplicar somente o arquivo revisado, na ferramenta de migration, depois do precheck de projeto/histórico e auditoria local.

A criação de um registro da migration de homologação no histórico administrativo do Supabase deve ser documentada; não altera migrations oficiais, mas o histórico do projeto é compartilhado.

O reset é explícito e fechado às tabelas de homologação, usa credencial de manutenção separada e valida um marcador de ambiente antes de limpar. Não oferecer reset ao jogador. Evitar TRUNCATE CASCADE; limpar em ordem de dependências e recriar somente seed fictício.

A reversão remove objetos em ordem definida, sem `DROP SCHEMA ... CASCADE`. Usar `DROP SCHEMA homologacao RESTRICT` apenas após remover seus próprios objetos. Se houver dependência externa, parar. Remover exclusivamente os papéis novos depois de conferir ownership/grants; não usar `DROP OWNED ... CASCADE` genérico. Reversão não apaga entradas administrativas do histórico nem exige mudança em `public`/`auth`.

## Aprovação que falta

Autorizar a identidade SQL exclusiva e a conexão restrita, além de aceitar autenticação fictícia local (sem criação de usuários Supabase). Isso é necessário porque o usuário expressamente reservou aprovação para permissões compartilhadas e pediu interrupção diante de possibilidade de escrita oficial. O schema foi autorizado, mas sua criação sem essa barreira ainda não satisfaz a condição de isolamento.

Se desejar obrigatoriamente testar Supabase Auth real ou Realtime real, será necessário apresentar outra proposta de mudanças compartilhadas antes de qualquer execução. Com os triggers atuais e sem alterar produção, criar usuários Auth fictícios é incompatível com preservação integral de `public.truco_*`.

Mesmo após esse desenho, CPU, I/O, conexões, disco, quotas, backups e indisponibilidade continuam compartilhados. Administradores continuam podendo acessar ambos os schemas. A separação lógica pode limitar escrita acidental por credenciais restritas; não oferece isolamento operacional nem risco zero equivalente a projetos separados.

Referências oficiais: [schemas personalizados](https://supabase.com/docs/guides/api/using-custom-schemas), [grants e RLS](https://supabase.com/docs/guides/api/securing-your-api).
