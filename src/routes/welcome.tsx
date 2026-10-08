import { and, asc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../auth/middleware";
import { type Db, getDb } from "../db";
import { invites, users } from "../db/schema";
import { DISPLAY_NAME_MAX, normalizeUsername, usernameError } from "../lib/username";
import { NotInvitedPage } from "../views/errors";
import { type WelcomeErrors, WelcomePage, type WelcomeValues } from "../views/welcome";

/** Convite pendente mais antigo para o email, com o nome de quem convidou. */
export const findPendingInvite = (db: Db, email: string) =>
  db
    .select({ id: invites.id, invitedBy: invites.invitedBy, inviterName: users.displayName })
    .from(invites)
    .innerJoin(users, eq(invites.invitedBy, users.id))
    .where(and(eq(invites.email, email), eq(invites.status, "pending")))
    .orderBy(asc(invites.createdAt), asc(invites.id))
    .get();

// Fica fora do requireMember: aqui chega quem ainda não tem conta.
export const welcome = new Hono<AppEnv>();

welcome.use(async (c, next) => {
  if (c.get("user")) return c.redirect("/");
  await next();
});

welcome.get("/", async (c) => {
  const invite = await findPendingInvite(getDb(c.env.DB), c.get("email"));
  if (!invite) return c.html(<NotInvitedPage email={c.get("email")} />, 403);
  return c.html(<WelcomePage inviterName={invite.inviterName} />);
});

welcome.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const email = c.get("email");
  const invite = await findPendingInvite(db, email);
  if (!invite) return c.html(<NotInvitedPage email={email} />, 403);

  const form = await c.req.parseBody();
  const values: WelcomeValues = {
    username: normalizeUsername(String(form.username ?? "")),
    displayName: String(form.displayName ?? "").trim(),
    acceptRules: form.acceptRules === "1",
  };

  const errors: WelcomeErrors = {};
  const usernameMsg = usernameError(values.username);
  if (usernameMsg) errors.username = usernameMsg;
  if (!values.displayName) errors.displayName = "Conte como você quer ser chamado.";
  else if (values.displayName.length > DISPLAY_NAME_MAX) {
    errors.displayName = `Use no máximo ${DISPLAY_NAME_MAX} caracteres.`;
  }
  if (!values.acceptRules) errors.acceptRules = "Para entrar, é preciso concordar com as regras.";

  if (!errors.username) {
    const taken = await db.query.users.findFirst({ where: eq(users.username, values.username) });
    if (taken) errors.username = "Esse apelido já está em uso. Escolha outro.";
  }

  const rerender = () =>
    c.html(<WelcomePage inviterName={invite.inviterName} values={values} errors={errors} />, 400);
  if (Object.keys(errors).length > 0) return rerender();

  const now = new Date();
  try {
    await db.batch([
      db.insert(users).values({
        email,
        username: values.username,
        displayName: values.displayName,
        invitedBy: invite.invitedBy,
      }),
      db
        .update(invites)
        .set({ status: "accepted", acceptedAt: now })
        .where(eq(invites.id, invite.id)),
      // Se mais de um membro convidou a mesma pessoa, os outros convites voltam para a cota.
      db
        .update(invites)
        .set({ status: "canceled" })
        .where(
          and(eq(invites.email, email), eq(invites.status, "pending"), ne(invites.id, invite.id)),
        ),
    ]);
  } catch (err) {
    // Outra pessoa pegou o apelido entre a checagem e o insert.
    if (String(err).includes("users.username")) {
      errors.username = "Esse apelido já está em uso. Escolha outro.";
      return rerender();
    }
    throw err;
  }

  return c.redirect("/", 303);
});
