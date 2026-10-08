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
npm run db:migrate:local   # cria o banco D1 local em .wrangler/
npm run dev                # http://localhost:8787
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o Worker localmente |
| `npm test` | Roda os testes |
| `npm run typecheck` | Checa os tipos |
| `npm run db:generate` | Gera uma migration nova a partir de `src/db/schema.ts` |
| `npm run db:migrate:local` | Aplica as migrations no banco local |
| `npm run db:migrate:remote` | Aplica as migrations no D1 de produção |
| `npm run cf-typegen` | Regenera `worker-configuration.d.ts` depois de mudar o `wrangler.jsonc` |

## Estrutura

```
src/
  index.tsx        rotas (Hono)
  db/schema.ts     tabelas (Drizzle)
  views/           páginas em JSX
public/            CSS e arquivos estáticos
drizzle/migrations migrations SQL geradas pelo drizzle-kit
test/              testes
```

## Deploy (ainda não feito)

1. `npx wrangler d1 create clube` e copie o `database_id` para o `wrangler.jsonc`
2. `npm run db:migrate:remote`
3. `npm run deploy`
4. Ativar o Cloudflare Access no Worker (passo 9 do `docs/mvp.md`)
