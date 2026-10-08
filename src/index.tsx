import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { type AppEnv, authenticate, requireMember } from "./auth/middleware";
import type { User } from "./db/schema";
import { adminRoutes } from "./routes/admin";
import { inviteRoutes } from "./routes/invites";
import { notificationRoutes } from "./routes/notifications";
import { reactionRoutes } from "./routes/reactions";
import { topicRoutes } from "./routes/topics";
import { userRoutes } from "./routes/users";
import { welcome } from "./routes/welcome";
import { ErrorPage } from "./views/errors";
import { RulesPage } from "./views/rules";

const app = new Hono<AppEnv>();

app.use(csrf(), authenticate);

// Boas-vindas vem antes do requireMember: é por aqui que convidados viram membros.
app.route("/boas-vindas", welcome);

app.use(requireMember);

app.route("/", topicRoutes);
app.route("/", reactionRoutes);
app.route("/", inviteRoutes);
app.route("/", notificationRoutes);
app.route("/", userRoutes);
app.route("/", adminRoutes);

app.get("/regras", (c) => c.html(<RulesPage user={c.get("user") as User} />));

app.notFound((c) =>
  c.html(
    <ErrorPage title="Página não encontrada">
      <a href="/">Voltar ao índice</a>
    </ErrorPage>,
    404,
  ),
);

export default app;
