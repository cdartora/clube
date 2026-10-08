# Clube: escopo do MVP

Fórum fechado para amigos próximos, sem anúncios. A inspiração é o TabNews, com a cara dos fóruns dos anos 2000: simples, rápido, renderizado no servidor.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Acesso | 100% fechado, sem nenhuma página pública |
| Auth | Cloudflare Access (login por código enviado ao email) |
| Onboarding | Convite feito por membro, cota de 1 convite por membro |
| Papéis | `admin` e `member` |
| Interação | Reações com emoji; sem votos e sem TabCoins |
| Editor | Amigável para quem não é técnico (barra de botões + visualização) |
| Stack | Hono + D1 + Drizzle, HTML renderizado no servidor + htmx |
| Domínio | Começa em `*.workers.dev`; domínio próprio fica para depois |

## Arquitetura

```
Navegador ──► Cloudflare Access ──► Worker (Hono) ──► D1
              (login por email)     │
                                    └──► API da Cloudflare (gerencia o grupo do Access)
```

- **Cloudflare Access** é o portão. Quem não está liberado não chega no Worker.
- **Worker (Hono)** valida o JWT do Access (`Cf-Access-Jwt-Assertion`: assinatura, `aud`, expiração), descobre o email e carrega o usuário do D1.
- **D1** guarda tudo: usuários, convites, tópicos, respostas, reações e notificações.
- **Páginas**: JSX do próprio Hono (`hono/jsx`) renderizado no servidor. O htmx entra onde evita recarregar a página inteira (reagir, prévia do editor, marcar notificação como lida).

### Limites do free tier

| Serviço | Limite | Uso esperado |
|---|---|---|
| Workers | 100k requests/dia | algumas centenas |
| D1 | 5M leituras e 100k escritas por dia, 5 GB | muito abaixo |
| Access | 50 usuários | começa com 4 |
| Cron Triggers | grátis | expirar convites (pós-MVP) |

## Auth e onboarding

### Por que o convite mexe no Access

Se a policy do Access aceitasse qualquer email, qualquer pessoa conseguiria passar pelo login e cada uma ocuparia uma das 50 vagas gratuitas. Por isso o Access libera apenas **um grupo de emails** (`clube-membros`), e o próprio app adiciona e remove emails desse grupo pela API da Cloudflare. O Access continua sendo o portão de verdade, e o banco espelha quem está dentro.

### Fluxo de convite

1. O membro abre **Convites** e digita o email do amigo. Isso usa a cota: 1 por membro, ilimitada para admin.
2. O Worker cria o convite (`pending`) e adiciona o email ao grupo do Access pela API.
3. O membro manda o link do clube para o amigo pelo WhatsApp. O app não envia email.
4. O amigo abre o link, informa o email e recebe o código da Cloudflare. Com o código, entra.
5. O app vê um email com convite pendente e sem usuário e abre a tela de **boas-vindas**: escolher apelido (username), nome de exibição e aceitar as regras da casa.
6. O usuário é criado, o convite fica `accepted` e o registro de `invited_by` monta a árvore de convites.

Outros casos:
- **Cancelar convite** (enquanto pendente): remove o email do grupo do Access e devolve a cota.
- **Desativar usuário** (admin): marca `disabled`, remove do grupo do Access e revoga as sessões dele.
- **Email autenticado sem usuário e sem convite**, que não deveria acontecer: página "você não foi convidado".
- **Primeiro admin**: criado por um script de seed. Os 3 amigos iniciais são convidados pelo admin no fluxo normal.

### Desenvolvimento local

Localmente não existe Access. Com a variável `DEV_USER_EMAIL` definida, e somente no ambiente local, o Worker pula a validação do JWT e usa esse email.

### Segredos do Worker

- `CF_API_TOKEN`: token com permissão de editar grupos do Access
- `CF_ACCOUNT_ID`, `ACCESS_GROUP_ID`
- `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`: para validar o JWT

## Funcionalidades do MVP

**Tópicos e respostas**
- Criar tópico (título e texto), editar e apagar os próprios.
- Respostas em **lista plana, com "citar"**, como nos fóruns clássicos. É mais fácil de acompanhar do que árvore para quem não é técnico. O campo `parent_id` existe no banco caso a gente queira aninhar depois.
- O apagar é lógico (`deleted_at`) e a resposta aparece como "mensagem removida".

**Página inicial**
- Lista de tópicos ordenada pela **última atividade**: uma resposta nova "sobe" o tópico.
- Indicador de **"novo"** em tópicos com respostas que você ainda não leu.
- Mostra autor, número de respostas e quem respondeu por último, e quando.

**Editor amigável**
- Uma caixa de texto com barra de botões: **negrito**, *itálico*, link, citação, lista e emoji.
- Abas **Escrever / Visualizar**. A prévia é renderizada pelo servidor via htmx, então o que se vê é exatamente o que vai ser publicado.
- O conteúdo é guardado em Markdown, mas a pessoa não precisa saber disso: os botões escrevem a sintaxe.
- A renderização usa `markdown-it` com HTML bruto desabilitado, para não abrir brecha de XSS.

**Reações**
- Um conjunto fixo de emojis (👍 ❤️ 😂 😮 😢 🔥) em tópicos e respostas.
- Clicar de novo remove. Passar o mouse mostra quem reagiu.

**Perfil**
- Apelido, nome de exibição, bio curta, data de entrada e quem convidou.
- Lista de tópicos da pessoa.

**Notificações (dentro do app)**
- Alguém respondeu seu tópico, citou você ou reagiu ao que você escreveu.
- Contador no cabeçalho e página com a lista.

**Admin**
- Convidar sem limite de cota, ajustar a cota de um membro e desativar usuário.

### Fora do MVP (próximos passos)
- Upload de imagens (R2)
- Busca (FTS5 do D1)
- Menções `@apelido`
- Expiração automática de convites (Cron Trigger)
- Digest semanal por email
- Domínio próprio
- PWA e notificação no celular
- Respostas aninhadas, se a lista plana não funcionar

## Modelo de dados (rascunho)

```
users
  id, email (único), username (único), display_name, bio,
  role ('admin' | 'member'), invite_quota (padrão 1),
  invited_by -> users.id, status ('active' | 'disabled'), created_at

invites
  id, email, invited_by -> users.id,
  status ('pending' | 'accepted' | 'canceled'),
  created_at, accepted_at

topics
  id, author_id -> users.id, title, body_md,
  reply_count, last_reply_at, last_reply_by -> users.id,
  last_activity_at, created_at, updated_at, deleted_at

replies
  id, topic_id -> topics.id, author_id -> users.id,
  parent_id -> replies.id (nulo no MVP), quoted_reply_id -> replies.id,
  body_md, created_at, updated_at, deleted_at

reactions
  user_id, target_type ('topic' | 'reply'), target_id, emoji, created_at
  PK (user_id, target_type, target_id, emoji)

topic_reads
  user_id, topic_id, last_read_at          -- marcador de "novo"
  PK (user_id, topic_id)

notifications
  id, user_id, actor_id, type ('reply' | 'quote' | 'reaction'),
  topic_id, reply_id, read_at, created_at
```

Como cota disponível se calcula: `invite_quota` menos os convites `pending` ou `accepted` daquele membro.

## Stack e ferramentas

- **Runtime**: Cloudflare Workers
- **Framework**: Hono, com `hono/jsx` para as páginas
- **Banco**: D1 + Drizzle ORM (migrations com `drizzle-kit`)
- **Front**: htmx + CSS escrito à mão (visual "fórum anos 2000", leve)
- **Markdown**: `markdown-it`
- **JWT**: `jose` (validação do token do Access)
- **Testes**: Vitest + `@cloudflare/vitest-pool-workers`
- **Deploy**: `wrangler` e, depois, GitHub Actions

## Ordem de implementação sugerida

1. Scaffold: Hono, wrangler, D1, Drizzle, layout base e CSS
2. Middleware de auth (JWT do Access + modo dev) e seed do admin
3. Onboarding: tela de boas-vindas e criação de usuário
4. Tópicos e respostas com o editor
5. Reações
6. Convites (com integração na API do Access)
7. Notificações e marcador de "novo"
8. Perfil e admin
9. Configurar o Access no `workers.dev` e fazer o deploy
