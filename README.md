# Clube

Fórum fechado para amigos, sem anúncios. Roda em Cloudflare Workers + D1.

O escopo do MVP e as decisões de produto estão em [`docs/mvp.md`](docs/mvp.md).

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

## Login

- **Produção:** o Cloudflare Access fica na frente do Worker. O Worker valida o JWT do header `Cf-Access-Jwt-Assertion` (assinatura, `aud`, emissor e validade) usando `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`, definidos no `wrangler.jsonc`.
- **Local:** com `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` vazios, vale o `DEV_USER_EMAIL`. Se o Access estiver configurado, o `DEV_USER_EMAIL` é ignorado. Se nenhum dos dois estiver definido, o fórum se recusa a abrir.
- Só entra quem tem conta ativa na tabela `users`; quem não tem vê "Você não foi convidado".

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o Worker localmente |
| `npm test` | Roda os testes |
| `npm run typecheck` | Checa os tipos |
| `npm run db:generate` | Gera uma migration nova a partir de `src/db/schema.ts` |
| `npm run db:migrate:local` | Aplica as migrations no banco local |
| `npm run db:migrate:remote` | Aplica as migrations no D1 de produção |
| `npm run seed:admin -- --email … --username … --name …` | Cria um admin (`--remote` para produção) |
| `npm run cf-typegen` | Regenera `worker-configuration.d.ts` depois de mudar o `wrangler.jsonc` |

## Estrutura

```
src/
  index.tsx        rotas (Hono)
  auth/            validação do JWT do Access e middleware de login
  routes/          rotas agrupadas por área (boas-vindas, tópicos e respostas)
  content/         textos do fórum (regras da casa)
  lib/             regras de negócio pequenas (validação, Markdown, árvore de respostas)
  db/schema.ts     tabelas (Drizzle)
  views/           páginas em JSX
public/            CSS, app.js (editor e aplausos), favicon e htmx
drizzle/migrations migrations SQL geradas pelo drizzle-kit
scripts/           scripts de linha de comando (seed do admin)
test/              testes
```

## Deploy (ainda não feito)

1. `npx wrangler d1 create clube` e copie o `database_id` para o `wrangler.jsonc`
2. `npm run db:migrate:remote`
3. `npm run seed:admin -- --email … --username … --name … --remote`
4. `npm run deploy`
5. Ativar o Cloudflare Access no Worker e preencher `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` (passo 9 do `docs/mvp.md`)
