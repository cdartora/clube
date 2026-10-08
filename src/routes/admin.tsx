import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Member } from "../auth/middleware";
import { getDb } from "../db";
import { users } from "../db/schema";
import { accessGroupClientFor } from "../lib/access-api";
import { listMembers, QUOTA_MAX } from "../lib/users";
import { AdminPage } from "../views/admin";
import { ErrorPage } from "../views/errors";

const me = (c: Context<AppEnv>) => c.get("user") as Member;

const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (me(c).role !== "admin") {
    return c.html(<ErrorPage title="Sem permissão">Essa área é só para admins.</ErrorPage>, 403);
  }
  await next();
});

const renderAdmin = async (c: Context<AppEnv>, error?: string, status: 200 | 400 | 502 = 200) =>
  c.html(<AdminPage user={me(c)} members={await listMembers(getDb(c.env.DB))} error={error} />, status);

/** Membro alvo de uma ação: existe, não é você e não é admin. */
const loadTarget = async (c: Context<AppEnv>) => {
  const target = await getDb(c.env.DB).query.users.findFirst({
    where: eq(users.id, Number(c.req.param("id"))),
  });
  if (!target) {
    return { error: c.html(<ErrorPage title="Não encontrado">Esse membro não existe.</ErrorPage>, 404) };
  }
  if (target.id === me(c).id || target.role === "admin") {
    return { error: c.html(<ErrorPage title="Sem permissão">Não dá para mudar a conta de um admin por aqui.</ErrorPage>, 403) };
  }
  return { target };
};

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("/admin", requireAdmin);
adminRoutes.use("/admin/*", requireAdmin);

adminRoutes.get("/admin", (c) => renderAdmin(c));

for (const [action, status] of [
  ["desativar", "disabled"],
  ["reativar", "active"],
] as const) {
  adminRoutes.post(`/admin/membros/:id{[0-9]+}/${action}`, async (c) => {
    const { target, error } = await loadTarget(c);
    if (error) return error;

    // O Access é o portão: primeiro tira (ou devolve) o email do grupo.
    try {
      const access = accessGroupClientFor(c.env);
      await (status === "disabled" ? access.removeEmail(target.email) : access.addEmail(target.email));
    } catch (err) {
      console.error(`Falha ao ${action} ${target.email} no Access`, err);
      return renderAdmin(c, "Não consegui atualizar o Access agora. Tente de novo em instantes.", 502);
    }
    await getDb(c.env.DB).update(users).set({ status }).where(eq(users.id, target.id));
    return c.redirect("/admin", 303);
  });
}

adminRoutes.post("/admin/membros/:id{[0-9]+}/cota", async (c) => {
  const { target, error } = await loadTarget(c);
  if (error) return error;

  const quota = Number((await c.req.parseBody()).quota);
  if (!Number.isInteger(quota) || quota < 0 || quota > QUOTA_MAX) {
    return renderAdmin(c, `A cota deve ser um número entre 0 e ${QUOTA_MAX}.`, 400);
  }
  await getDb(c.env.DB).update(users).set({ inviteQuota: quota }).where(eq(users.id, target.id));
  return c.redirect("/admin", 303);
});
