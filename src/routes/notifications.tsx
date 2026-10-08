import { type Context, Hono } from "hono";
import type { AppEnv, Member } from "../auth/middleware";
import { getDb } from "../db";
import { listNotifications, markAllRead } from "../lib/notifications";
import { NotificationsPage } from "../views/notifications";

const me = (c: Context<AppEnv>) => c.get("user") as Member;

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get("/notificacoes", async (c) => {
  const items = await listNotifications(getDb(c.env.DB), me(c).id);
  return c.html(<NotificationsPage user={me(c)} items={items} />);
});

notificationRoutes.post("/notificacoes/lidas", async (c) => {
  await markAllRead(getDb(c.env.DB), me(c).id);
  return c.redirect("/notificacoes", 303);
});
