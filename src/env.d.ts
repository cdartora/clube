// Variáveis que não aparecem no wrangler.jsonc (vêm do .dev.vars local ou de `wrangler secret put`).
type ExtraEnv = {
  DEV_USER_EMAIL?: string;
  CF_API_TOKEN?: string;
};

interface Env extends ExtraEnv {}

declare namespace Cloudflare {
  interface Env extends ExtraEnv {}
}
