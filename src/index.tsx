import { desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { type AppEnv, authenticate, requireMember } from "./auth/middleware";
import { getDb } from "./db";
import { topics, users } from "./db/schema";
import { HomePage } from "./views/home";
import { ErrorPage } from "./views/errors";

const app = new Hono<AppEnv>();

app.use(authenticate, requireMember);

app.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: topics.id,
      title: topics.title,
      author: users.displayName,
      replyCount: topics.replyCount,
      lastActivityAt: topics.lastActivityAt,
    })
    .from(topics)
    .innerJoin(users, eq(topics.authorId, users.id))
    .where(isNull(topics.deletedAt))
    .orderBy(desc(topics.lastActivityAt))
    .limit(50);

  return c.html(<HomePage topics={rows} user={c.get("user")!} />);
});

app.notFound((c) =>
  c.html(
    <ErrorPage title="Página não encontrada">
      <a href="/">Voltar ao índice</a>
    </ErrorPage>,
    404,
  ),
);

export default app;
