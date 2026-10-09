# Deploy

Passo a passo para colocar o Clube no ar em `*.workers.dev`, protegido pelo Cloudflare Access.
Os nomes dos menus do painel da Cloudflare mudam de vez em quando; se algo não bater, procure pelo nome da opção.

## 1. Banco e Worker

O banco D1 já existe (o `database_id` está no `wrangler.jsonc`). Fotos e vídeos ficam num bucket R2, que
precisa existir antes do primeiro deploy (o R2 tem que estar ativado na conta: painel › **R2**):

```sh
npx wrangler login                 # uma vez, abre o navegador
npx wrangler r2 bucket create clube-media
npm run db:migrate:remote          # cria as tabelas no D1 de produção
npm run seed:admin -- --remote --email SEU@EMAIL --username seuapelido --name "Seu Nome"
npm run deploy                     # mostra a URL: https://clube.<sua-conta>.workers.dev
```

Neste ponto o Worker está no ar, mas responde "Fórum mal configurado" (500): sem Access e sem
`DEV_USER_EMAIL`, ele se recusa a abrir. É de propósito.

## 2. Cloudflare Access (Zero Trust)

1. No painel, abra **Zero Trust**. Na primeira vez ele pede um nome de time (por exemplo `clube`), que vira
   o domínio `clube.cloudflareaccess.com`, e um plano: escolha o **Free** (até 50 usuários). Pode pedir um
   cartão mesmo no plano gratuito.
2. Em **Settings › Authentication**, confira que o login **One-time PIN** (código por email) está ativo.
3. Em **Access › Access groups** (ou *Access controls › Access groups*), crie o grupo **clube-membros** com a
   regra *Include › Emails* contendo o seu email. Guarde o **ID do grupo** (aparece na URL da página do grupo).
4. Proteja o Worker: em **Workers & Pages › clube › Settings › Domains & Routes**, ative o
   **Cloudflare Access** no `workers.dev`. Isso cria uma aplicação no Access.
5. Na aplicação criada (**Access › Applications**), troque a política para permitir **apenas o grupo
   clube-membros**, e copie o **Application Audience (AUD) Tag**.

Se a sua conta tiver **Preview URLs** ativas no Worker, elas também ficam protegidas: o próprio Worker
exige o token do Access e recusa qualquer requisição sem ele.

## 3. Token da API (para os convites)

Os convites adicionam e removem emails do grupo `clube-membros` pela API.

1. Em **My Profile › API Tokens › Create Token › Custom token**, dê a permissão
   **Account › Access: Organizations, Identity Providers, and Groups › Edit**, limitada à sua conta.
2. Grave o token como segredo do Worker (ele não vai para o git):

   ```sh
   npx wrangler secret put CF_API_TOKEN
   ```

## 4. Ligar tudo

Preencha no `wrangler.jsonc`:

| Variável | Onde achar |
|---|---|
| `ACCESS_TEAM_DOMAIN` | `seutime.cloudflareaccess.com` (passo 2.1) |
| `ACCESS_AUD` | AUD Tag da aplicação (passo 2.5) |
| `CF_ACCOUNT_ID` | Painel › Workers & Pages, na lateral ("Account ID") |
| `ACCESS_GROUP_ID` | ID do grupo `clube-membros` (passo 2.3) |

Depois:

```sh
npm run deploy
```

Abra a URL do Worker: o Access pede seu email, manda um código, e você cai no índice do Clube.

## Conferindo

- Com outro email (fora do grupo), o Access não deixa passar.
- Em **Convites**, convide alguém: o email aparece no grupo `clube-membros` do painel.
- Cancelando o convite, o email sai do grupo.

## Branches e ambientes

| Branch | Ambiente | Worker | Banco D1 |
|---|---|---|---|
| `main` | produção | `clube` | `clube` |
| `stage` | staging | `clube-staging` | `clube-staging` |
| qualquer outra (PRs) | preview do staging | versão de preview do `clube-staging` | `clube-staging` |

Fluxo: abra o PR contra `stage`; cada push na branch gera uma preview URL. Depois do merge, o `stage` vai
para o staging. Quando o staging estiver bom, abra um PR de `stage` para `main`.

A produção não tem preview URLs (`preview_urls: false`): uma preview do Worker `clube` usaria o banco de
produção.

## 5. Staging

O staging é um segundo Worker (`clube-staging`, o `env.staging` do `wrangler.jsonc`), com banco e grupo do
Access próprios. Assim, testes e convites feitos no staging não mexem na produção.

1. Crie o banco e copie o `database_id` que aparecer para `env.staging.d1_databases` no `wrangler.jsonc`:

   ```sh
   npx wrangler d1 create clube-staging
   npx wrangler r2 bucket create clube-media-staging
   ```

2. Crie as tabelas, o primeiro admin e suba o Worker:

   ```sh
   npm run db:migrate:staging
   npm run seed:admin -- --staging --email SEU@EMAIL --username seuapelido --name "Seu Nome"
   npm run deploy:staging            # https://clube-staging.<sua-conta>.workers.dev
   ```

3. Repita o passo 2 (Access) para o `clube-staging`: crie o grupo **clube-staging**, ative o Access no
   `workers.dev` **e nas Preview URLs** do Worker e restrinja as duas aplicações ao grupo. Cada aplicação tem
   o seu AUD Tag: coloque os dois em `ACCESS_AUD`, separados por vírgula.
4. Grave o token também no staging: `npx wrangler secret put CF_API_TOKEN --env staging`.
5. Preencha `env.staging.vars` no `wrangler.jsonc` (mesmo `ACCESS_TEAM_DOMAIN` e `CF_ACCOUNT_ID`; o
   `ACCESS_GROUP_ID` é o do grupo `clube-staging`).

Os valores de `vars` não são segredos: deixe-os no `wrangler.jsonc`. Variáveis criadas só no painel são
apagadas a cada `wrangler deploy` que não as tenha no arquivo. Só o `CF_API_TOKEN` fica como segredo.

## 6. Deploy automático (Workers Builds)

Em **Workers & Pages › (Worker) › Settings › Builds**, conecte o repositório:

| | `clube` (produção) | `clube-staging` |
|---|---|---|
| Branch de produção | `main` | `stage` |
| Comando de deploy | `npx wrangler deploy` | `npx wrangler deploy --env staging` |
| Preview builds | desligado | ligado |
| Preview command | — | `npx wrangler preview --env staging` |

O `--env staging` é obrigatório nos dois comandos: sem ele, o wrangler usa a configuração de produção.
As previews usam o bloco `env.staging.previews` do `wrangler.jsonc` (mesmo banco e variáveis do staging) e
têm segredos próprios, compartilhados por todas elas: `npx wrangler preview base-config secret put CF_API_TOKEN --env staging`.

Com isso, cada push em uma branch de PR gera uma preview do `clube-staging` (aparece no check do PR no
GitHub), protegida pelo Access. As migrations não rodam sozinhas: quando um PR trouxer
migration nova, rode `npm run db:migrate:staging` antes de testar a preview, e `npm run db:migrate:remote`
antes do merge em `main`.

## Fotos e vídeos (R2)

Os arquivos ficam no R2 (`clube-media` na produção, `clube-media-staging` no staging e nas previews) e são
servidos pelo próprio Worker em `/m/...`. O bucket fica privado, sem domínio público nem `r2.dev`: só quem
passa pelo Access vê as mídias.

Limites: fotos (JPEG, PNG, GIF, WebP) até 10 MB, vídeos (MP4, WebM) até 25 MB e foto de perfil até 2 MB.
O tipo é conferido pelo conteúdo do arquivo, não pelo nome. Ao trocar ou tirar a foto de perfil, a antiga é
apagada; mídias de posts apagados continuam no bucket.
