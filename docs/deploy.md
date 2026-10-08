# Deploy

Passo a passo para colocar o Clube no ar em `*.workers.dev`, protegido pelo Cloudflare Access.
Os nomes dos menus do painel da Cloudflare mudam de vez em quando; se algo não bater, procure pelo nome da opção.

## 1. Banco e Worker

O banco D1 já existe (o `database_id` está no `wrangler.jsonc`).

```sh
npx wrangler login                 # uma vez, abre o navegador
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
