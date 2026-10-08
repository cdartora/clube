import { desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "./db";
import { topics, users } from "./db/schema";
import { HomePage } from "./views/home";
import { Layout } from "./views/layout";

const app = new Hono<{ Bindings: Env }>();

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

  return c.html(<HomePage topics={rows} />);
});

app.notFound((c) =>
  c.html(
    <Layout title="Não encontrado">
      <div class="box">
        <h2>Página não encontrada</h2>
        <p>
          <a href="/">Voltar ao índice</a>
        </p>
      </div>
    </Layout>,
    404,
  ),
);

export default app;
