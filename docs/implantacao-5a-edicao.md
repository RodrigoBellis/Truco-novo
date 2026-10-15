# Implantação da 5ª edição no Supabase real — plano para aprovação (14/10/2026)

Nada deste plano foi executado no Supabase oficial nem publicado. Cada passo marcado com **[autorização]** grava em produção e só acontece com a sua aprovação, dada para aquele passo.

## O que vai para produção

| Peça | Arquivo | Efeito |
| --- | --- | --- |
| Migrations já planejadas | `202610070001`, `202610070002`, `202610090001`, `202610090002` (ver `plano-producao-5a-edicao.md`) | Capacidade por helper, cadeado de resultados (nasce **fechado**), unicidade do mata-mata, progressão transacional |
| Formato de 7 duplas | `202610140001_edition5_single_group_seven_teams.sql` | Limite de 7 duplas no grupo único; fase `terceiro`; lado `loser` |
| Primeiro acesso | `202610140002_first_access_setup.sql` | Colunas `access_setup_required`, `access_setup_completed_at`, `sessions_valid_after` em `truco_profiles` |
| Limpeza dos jogos de teste | `supabase/scripts/edition5_reset_competition.sql` | Apaga os 20 jogos e 5 placares de teste da 5ª edição (modo ensaio por padrão) |
| Participantes oficiais | `supabase/scripts/edition5_replace_participants.sql` | Rafael → Rafinha (mesmo id), cadastra Anderson, Saulo e Digão, grava as 7 duplas (modo ensaio por padrão) |
| Backend e frontend | build atual | Grupo único, mata-mata com 3º lugar, "Crie sua senha", Admin → Jogadores |

## Ordem

### 0. Retrato e backup (somente leitura, depois **[autorização]** para o backup)
1. Confirmar o projeto `sfllpogpuqukhjddwiel` e a última migration remota do Truco (`20261005232535`).
2. `edition5_precheck.sql` e contagem + hash das 12 tabelas `truco_*` (guardar a saída).
3. **[autorização]** Schema `truco_backup_AAAAMMDD` com cópia das 12 tabelas; conferir contagens. Anotar o último backup automático do painel.
4. Exportar a lista de usuários do Auth do Truco (ids e e-mails, sem senha) para conferência posterior.

### 1. Manutenção
5. Backend antigo parado (o novo não funciona com o banco antigo e vice-versa).

### 2. Banco **[autorização]**
6. Aplicar, uma por vez: `202610070001`, `202610070002`, `202610090001`, `202610090002`, `202610140001`, `202610140002`. Depois de cada uma: conferir o objeto criado e repetir o hash das tabelas — jogadores, duplas, participações, perfis e histórico têm de continuar idênticos.
7. `edition5_reset_competition.sql`: primeiro como está (ensaio), depois com `v_ensaio = false`.
8. `edition5_replace_participants.sql`: primeiro como está (ensaio, mostra as 7 duplas e desfaz), depois com `v_ensaio = false`. As travas internas param tudo se o Hall da Fama, os pares históricos ou as contas mudarem.
9. Conferir: 7 duplas aprovadas no grupo "A"; 14 participantes; Rafinha com o id do antigo Rafael; Digão diferente do Diguinho; títulos 1ª e 2ª Bagriel & Diguinho, 3ª Bitula & Vinícius, 4ª Ronaldo & Rodrigo.

### 3. Publicação **[autorização]**
10. Subir backend e frontend novos (uma instância do backend). Regenerar os tipos.
11. Cadeado **fechado** (a migration já cria fechado; conferir em Admin).
12. Admin → Grupos → "Gerar 21 jogos da fase de grupos".

### 4. Acesso dos 14 **[autorização]**
13. Admin → Jogadores → **"Reiniciar acesso de todos"** (só funciona com o cadeado fechado). Para cada um dos 14:
    - os 11 existentes: a senha é trocada por uma aleatória que ninguém conhece, a conta passa a "Aguardando criação de senha" e toda sessão aberta antes é recusada;
    - os 3 novos (Anderson, Saulo, Digão): a conta é criada já em "Aguardando criação de senha".
    Contas de quem saiu da edição, jogadores históricos e títulos não são tocados.
14. Avisar o grupo: "abra o site, toque na sua carta e crie sua senha". Acompanhar em Admin → Jogadores ("X de 14").

### 5. Validação com Supabase Auth real (antes de avisar o grupo)
A homologação usa autenticação simulada. Estes pontos só se provam no Auth real, com **uma conta de teste** criada para isso (não um dos 14) — ou com o primeiro jogador que topar acompanhar:
- **Criação da senha:** a carta abre "Crie sua senha", a senha é gravada (`auth.admin.updateUserById`) e o login com ela funciona; entrar de novo depois de sair e recarregar.
- **Senha antiga:** depois do reinício, a senha anterior é recusada.
- **Sessão antiga:** uma sessão aberta antes do reinício recebe 401. Depende do claim `amr` do token do Supabase (horário do login, mantido na renovação); conferir que o token real traz `amr` com `timestamp` e que a renovação da sessão o preserva. Se não trouxer, o backend usa `iat` — e uma sessão renovada depois do reinício voltaria a valer: nesse caso, o ajuste é revogar as sessões pelo Auth (`auth.admin.signOut`) no reinício.
- **Cadastro único:** segunda tentativa de criar a senha da mesma carta recebe 409.
- **Política de senha do projeto:** mínimo de 6 caracteres; se a proteção contra senhas vazadas estiver ligada, senhas comuns são recusadas pelo Auth — a tela mostra a mensagem.
- **Realtime e leituras públicas** (Hall da Fama, Maiores Campeões) continuam funcionando.

### Recuperação
- Problema no banco: restaurar do `truco_backup_AAAAMMDD` tabela por tabela; desfazer o schema com `rollback_progressao_5a_edicao.sql` (as colunas novas de `truco_profiles` saem com `alter table ... drop column`).
- Problema no acesso de um jogador: "Redefinir acesso" em Admin → Jogadores.
- Critério para reverter: hash diferente depois de uma migration, erro ao aplicar, ou falha de login/leitura na validação.

## Decisões pendentes
- **Proxy:** atrás do Nginx, o backend vê todos os jogadores com o mesmo IP; o limite de tentativas por origem (60 em 10 minutos) passa a ser coletivo. Com 14 pessoas é suficiente. Se o backend estiver atrás de um único proxy, ativar `app.set("trust proxy", 1)` faz o limite valer por pessoa.
- **Risco aceito:** sem verificação de identidade, quem tocar a carta de outro jogador antes dele cria a senha no lugar dele. O dono percebe ("já criou a senha") e o administrador usa "Redefinir acesso"; a auditoria registra quando cada senha foi criada.
- **`202610090003_homologacao_runtime_role.sql`:** nunca aplicada; movida em 14/10/2026 para `supabase/homologacao/arquivo/`, fora da pasta de migrations oficiais.
