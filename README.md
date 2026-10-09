# Clube

Fórum fechado para amigos, sem anúncios. Roda em Cloudflare Workers + D1.

O escopo do MVP e as decisões de produto estão em [`docs/mvp.md`](docs/mvp.md).

**Situação:** o MVP está implementado e testado; falta o deploy (veja [`docs/deploy.md`](docs/deploy.md)).

## O que o fórum faz

- **Entrada só por convite.** O Cloudflare Access cuida do login (código por email). Cada membro tem 1 convite; o app libera o email do convidado no Access e mostra o link para mandar pelo WhatsApp.
- **Boas-vindas:** o convidado escolhe apelido e nome de exibição e aceita as [regras da casa](src/content/rules.tsx).
- **Tópicos e respostas em árvore**, com editor de barra de botões (negrito, itálico, link, citação, lista) e prévia. O texto é guardado em Markdown, sem HTML bruto.
- **Votos ▲ ▼** anônimos, que ordenam as respostas, e **aplausos 👏** públicos, até 10 por pessoa em cada post.
- **Notificações** de respostas e aplausos, e marcas de **"novo"** / **"novas respostas"** no índice.
- **Perfis** (`/u/apelido`) e um **painel de admin** para ajustar cotas e desativar ou reativar membros.
- Visual de fórum dos anos 2000, HTML renderizado no servidor, funciona no celular.

## Stack

- [Hono](https://hono.dev) com `hono/jsx` (HTML renderizado no servidor)
- [htmx](https://htmx.org) para interações sem recarregar a página (servido de `public/vendor/`)
- Cloudflare D1 + [Drizzle ORM](https://orm.drizzle.team)
- Vitest + `@cloudflare/vitest-plugin` (os testes rodam dentro do runtime do Workers)

## Rodando localmente

Requer Node 22+. Use o npm 11 ou mais novo: o npm 10 tem um bug ao resolver as dependências do Vitest 4.

```sh
npm install
cp .dev.vars.example .dev.vars   # coloque o seu email em DEV_USER_EMAIL
npm run db:migrate:local         # cria o banco D1 local em .wrangler/
npm run seed:admin -- --email voce@exemplo.com --username voce --name "Seu Nome"
npm run dev                      # http://localhost:8787
```

Localmente não existe Cloudflare Access: o Worker considera que você entrou com o email de `DEV_USER_EMAIL`. Use o mesmo email no `seed:admin`.

Sem `CF_API_TOKEN` configurado, os convites e a desativação de membros só mexem no banco local e registram no log o que fariam no Access.

Mudou o `database_id` no `wrangler.jsonc`? O wrangler cria um banco local novo e vazio: rode `npm run db:migrate:local` e o `seed:admin` de novo.

## Login e configuração

- **Produção:** o Cloudflare Access fica na frente do Worker. O Worker valida o JWT do header `Cf-Access-Jwt-Assertion` (assinatura, `aud`, emissor e validade) usando `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`, definidos no `wrangler.jsonc`.
- **Local:** com `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` vazios, vale o `DEV_USER_EMAIL`. Se o Access estiver configurado, o `DEV_USER_EMAIL` é ignorado. Se nenhum dos dois estiver definido, o fórum se recusa a abrir.
- Só entra quem tem conta ativa na tabela `users`; quem não tem vê "Você não foi convidado".
- Os convites usam a API de grupos do Access: `CF_ACCOUNT_ID` e `ACCESS_GROUP_ID` ficam no `wrangler.jsonc`, e o token `CF_API_TOKEN` é segredo (`npx wrangler secret put CF_API_TOKEN`).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o Worker localmente |
| `npm test` | Roda os testes (dentro do runtime do Workers, com a API do Access simulada) |
| `npm run typecheck` | Checa os tipos |
| `npm run db:generate` | Gera uma migration nova a partir de `src/db/schema.ts` |
| `npm run db:migrate:local` | Aplica as migrations no banco local |
| `npm run db:migrate:remote` | Aplica as migrations no D1 de produção |
| `npm run db:migrate:staging` | Aplica as migrations no D1 do staging |
| `npm run deploy:staging` | Sobe o Worker de staging (`clube-staging`) |
| `npm run seed:admin -- --email … --username … --name …` | Cria um admin (`--remote` para produção, `--staging` para o staging) |
| `npm run cf-typegen` | Regenera `worker-configuration.d.ts` depois de mudar o `wrangler.jsonc` |

## Estrutura

```
src/
  index.tsx        rotas (Hono)
  auth/            validação do JWT do Access e middleware de login
  routes/          rotas agrupadas por área (boas-vindas, tópicos, votos, convites, notificações, perfil, admin)
  content/         textos do fórum (regras da casa)
  lib/             regras de negócio (Markdown, árvore de respostas, votos, convites, API do Access, notificações)
  db/schema.ts     tabelas (Drizzle)
  views/           páginas em JSX
public/            CSS, app.js (editor e aplausos), favicon e htmx
drizzle/migrations migrations SQL geradas pelo drizzle-kit
scripts/           scripts de linha de comando (seed do admin)
test/              testes
```

## Deploy

O passo a passo completo (D1, Access, token da API e variáveis) está em [`docs/deploy.md`](docs/deploy.md).

Branches: `main` é produção, `stage` é staging. PRs vão para `stage` e ganham uma preview URL; o staging
vai para a produção num PR de `stage` para `main`.
