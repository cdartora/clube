// Variáveis que não aparecem no wrangler.jsonc (vêm do .dev.vars local).
type ExtraEnv = {
  DEV_USER_EMAIL?: string;
};

interface Env extends ExtraEnv {}

declare namespace Cloudflare {
  interface Env extends ExtraEnv {}
}
