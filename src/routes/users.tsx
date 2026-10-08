import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { AppEnv, Member } from "../auth/middleware";
import { getDb } from "../db";
import { users } from "../db/schema";
import { BIO_MAX, loadProfile, loadProfileActivity } from "../lib/users";
import { DISPLAY_NAME_MAX } from "../lib/username";
import { ErrorPage } from "../views/errors";
import { ProfileEditPage, ProfilePage } from "../views/profile";

const me = (c: Context<AppEnv>) => c.get("user") as Member;

export const userRoutes = new Hono<AppEnv>();

userRoutes.get("/u/:username", async (c) => {
  const db = getDb(c.env.DB);
  const profile = await loadProfile(db, c.req.param("username").toLowerCase());
  if (!profile) {
    return c.html(<ErrorPage title="Não encontrado">Não existe ninguém com esse apelido no Clube.</ErrorPage>, 404);
  }
  const activity = await loadProfileActivity(db, profile.id);
  return c.html(<ProfilePage user={me(c)} profile={profile} activity={activity} />);
});

userRoutes.get("/perfil", (c) =>
  c.html(<ProfileEditPage user={me(c)} values={{ displayName: me(c).displayName, bio: me(c).bio }} />),
);

userRoutes.post("/perfil", async (c) => {
  const form = await c.req.parseBody();
  const values = {
    displayName: String(form.displayName ?? "").trim(),
    bio: String(form.bio ?? "").replace(/\r\n?/g, "\n").trim(),
  };
  const errors: { displayName?: string; bio?: string } = {};
  if (!values.displayName) errors.displayName = "Conte como você quer ser chamado.";
  else if (values.displayName.length > DISPLAY_NAME_MAX) {
    errors.displayName = `Use no máximo ${DISPLAY_NAME_MAX} caracteres.`;
  }
  if (values.bio.length > BIO_MAX) errors.bio = `Use no máximo ${BIO_MAX} caracteres.`;
  if (errors.displayName || errors.bio) {
    return c.html(<ProfileEditPage user={me(c)} values={values} errors={errors} />, 400);
  }

  await getDb(c.env.DB).update(users).set(values).where(eq(users.id, me(c).id));
  return c.redirect(`/u/${me(c).username}`, 303);
});
