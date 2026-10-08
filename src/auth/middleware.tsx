import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db";
import { type User, users } from "../db/schema";
import { findPendingInvite } from "../routes/welcome";
import { ErrorPage, NotInvitedPage } from "../views/errors";
import { ACCESS_JWT_HEADER, verifyAccessJwt } from "./access";

export type AuthVariables = {
  email: string;
  user: User | null;
};

export type AppEnv = { Bindings: Env; Variables: AuthVariables };

/**
 * Descobre quem está acessando.
 *
 * Em produção o email vem do JWT do Cloudflare Access. Sem Access configurado
 * (desenvolvimento local), usa DEV_USER_EMAIL. Se o Access estiver configurado,
 * DEV_USER_EMAIL é ignorado, então esquecê-lo ligado não abre o fórum.
 */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, DEV_USER_EMAIL } = c.env;

  let email: string | null = null;
  if (ACCESS_TEAM_DOMAIN && ACCESS_AUD) {
    const token = c.req.header(ACCESS_JWT_HEADER);
    if (token) {
      email = await verifyAccessJwt(token, { teamDomain: ACCESS_TEAM_DOMAIN, aud: ACCESS_AUD });
    }
  } else if (DEV_USER_EMAIL) {
    email = DEV_USER_EMAIL.toLowerCase();
  } else {
    console.error("Auth não configurada: defina ACCESS_TEAM_DOMAIN/ACCESS_AUD ou DEV_USER_EMAIL");
    return c.html(
      <ErrorPage title="Fórum mal configurado">
        O login ainda não foi configurado. Avise quem administra o Clube.
      </ErrorPage>,
      500,
    );
  }

  if (!email) {
    return c.html(
      <ErrorPage title="Acesso negado">Não foi possível confirmar quem é você.</ErrorPage>,
      401,
    );
  }

  const user = await getDb(c.env.DB).query.users.findFirst({ where: eq(users.email, email) });
  c.set("email", email);
  c.set("user", user ?? null);
  await next();
});

/** Só deixa passar membros ativos. */
export const requireMember = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (user?.status === "active") return next();

  if (user?.status === "disabled") {
    return c.html(
      <ErrorPage title="Conta desativada">
        Sua conta no Clube foi desativada. Fale com quem administra o fórum.
      </ErrorPage>,
      403,
    );
  }

  // Ainda sem conta: quem tem convite pendente vai para as boas-vindas.
  const invite = await findPendingInvite(getDb(c.env.DB), c.get("email"));
  if (invite) return c.redirect("/boas-vindas");
  return c.html(<NotInvitedPage email={c.get("email")} />, 403);
});
