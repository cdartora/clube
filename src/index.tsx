import { desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { type AppEnv, authenticate, requireMember } from "./auth/middleware";
import { getDb } from "./db";
import { topics, users } from "./db/schema";
import { welcome } from "./routes/welcome";
import { ErrorPage } from "./views/errors";
import { HomePage } from "./views/home";
import { RulesPage } from "./views/rules";

const app = new Hono<AppEnv>();

app.use(csrf(), authenticate);

// Boas-vindas vem antes do requireMember: é por aqui que convidados viram membros.
app.route("/boas-vindas", welcome);

app.use(requireMember);

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

app.get("/regras", (c) => c.html(<RulesPage user={c.get("user")!} />));

app.notFound((c) =>
  c.html(
    <ErrorPage title="Página não encontrada">
      <a href="/">Voltar ao índice</a>
    </ErrorPage>,
    404,
  ),
);

export default app;
