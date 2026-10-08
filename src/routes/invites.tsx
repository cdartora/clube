import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { AppEnv } from "../auth/middleware";
import { getDb } from "../db";
import { invites, type User } from "../db/schema";
import { accessGroupClientFor } from "../lib/access-api";
import { emailError, inviteBlocker, invitesLeft, listInvitesBy, normalizeEmail } from "../lib/invites";
import { ErrorPage } from "../views/errors";
import { InvitesPage } from "../views/invites";

const me = (c: Context<AppEnv>) => c.get("user") as User;

const renderPage = async (
  c: Context<AppEnv>,
  extra: { justInvited?: string; values?: { email: string }; error?: string } = {},
  status: 200 | 400 | 502 = 200,
) => {
  const db = getDb(c.env.DB);
  const [left, rows] = await Promise.all([invitesLeft(db, me(c)), listInvitesBy(db, me(c).id)]);
  return c.html(
    <InvitesPage user={me(c)} left={left} invites={rows} siteUrl={new URL(c.req.url).origin} {...extra} />,
    status,
  );
};

export const inviteRoutes = new Hono<AppEnv>();

inviteRoutes.get("/convites", async (c) => {
  const id = Number(c.req.query("enviado"));
  let justInvited: string | undefined;
  if (Number.isSafeInteger(id) && id > 0) {
    const row = await getDb(c.env.DB).query.invites.findFirst({
      where: and(eq(invites.id, id), eq(invites.invitedBy, me(c).id), eq(invites.status, "pending")),
    });
    justInvited = row?.email;
  }
  return renderPage(c, { justInvited });
});

inviteRoutes.post("/convites", async (c) => {
  const db = getDb(c.env.DB);
  const email = normalizeEmail((await c.req.parseBody()).email);
  const values = { email };

  if ((await invitesLeft(db, me(c))) <= 0) {
    return renderPage(c, { values, error: "Você não tem convites disponíveis." }, 400);
  }
  const error = emailError(email) ?? (await inviteBlocker(db, email));
  if (error) return renderPage(c, { values, error }, 400);

  // Primeiro libera no Access: se falhar, nada fica registrado e dá para tentar de novo.
  try {
    await accessGroupClientFor(c.env).addEmail(email);
  } catch (err) {
    console.error("Falha ao liberar email no Access", err);
    return renderPage(
      c,
      { values, error: "Não consegui liberar o acesso dessa pessoa agora. Tente de novo em instantes." },
      502,
    );
  }

  const created = await db
    .insert(invites)
    .values({ email, invitedBy: me(c).id })
    .returning({ id: invites.id })
    .get();
  return c.redirect(`/convites?enviado=${created.id}`, 303);
});

inviteRoutes.post("/convites/:id{[0-9]+}/cancelar", async (c) => {
  const db = getDb(c.env.DB);
  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.id, Number(c.req.param("id"))), eq(invites.status, "pending")),
  });
  if (!invite) {
    return c.html(<ErrorPage title="Não encontrado">Esse convite não existe ou já foi usado.</ErrorPage>, 404);
  }
  if (invite.invitedBy !== me(c).id && me(c).role !== "admin") {
    return c.html(<ErrorPage title="Sem permissão">Só quem convidou pode cancelar.</ErrorPage>, 403);
  }

  try {
    await accessGroupClientFor(c.env).removeEmail(invite.email);
  } catch (err) {
    console.error("Falha ao remover email do Access", err);
    return renderPage(c, { error: "Não consegui cancelar o acesso agora. Tente de novo em instantes." }, 502);
  }
  await db.update(invites).set({ status: "canceled" }).where(eq(invites.id, invite.id));
  return c.redirect("/convites", 303);
});
