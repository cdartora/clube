import { type Context, Hono } from "hono";
import type { AppEnv } from "../auth/middleware";
import { getDb } from "../db";
import { MAX_CLAPS, TARGET_TYPES, type TargetType, type User } from "../db/schema";
import {
  addClaps,
  castVote,
  EMPTY_REACTIONS,
  loadReactions,
  loadTarget,
  reactionKey,
  type Target,
} from "../lib/reactions";
import { ErrorPage } from "../views/errors";
import { Reactions } from "../views/reactions";

const me = (c: Context<AppEnv>) => c.get("user") as User;

const badRequest = (c: Context<AppEnv>, msg: string) =>
  c.html(<ErrorPage title="Pedido inválido">{msg}</ErrorPage>, 400);

const parseTarget = (form: Record<string, unknown>) => {
  const type = String(form.targetType) as TargetType;
  const id = Number(form.targetId);
  if (!TARGET_TYPES.includes(type) || !Number.isSafeInteger(id) || id <= 0) return null;
  return { type, id };
};

/** Carrega o alvo e confere que ele existe e não é do próprio usuário. */
const resolveTarget = async (c: Context<AppEnv>, form: Record<string, unknown>) => {
  const parsed = parseTarget(form);
  if (!parsed) return { error: badRequest(c, "Post inválido.") };
  const target = await loadTarget(getDb(c.env.DB), parsed.type, parsed.id);
  if (!target) {
    return {
      error: c.html(<ErrorPage title="Não encontrado">Esse post não existe ou foi removido.</ErrorPage>, 404),
    };
  }
  if (target.authorId === me(c).id) {
    return {
      error: c.html(<ErrorPage title="Sem permissão">Não dá para votar ou aplaudir o próprio post.</ErrorPage>, 403),
    };
  }
  return { target };
};

/** htmx recebe o bloco atualizado; sem JavaScript, volta para o post. */
const respond = async (c: Context<AppEnv>, before: Target) => {
  if (!c.req.header("HX-Request")) {
    const anchor = before.type === "reply" ? `#r-${before.id}` : "";
    return c.redirect(`/t/${before.topicId}${anchor}`, 303);
  }
  const db = getDb(c.env.DB);
  const target = (await loadTarget(db, before.type, before.id)) ?? before;
  const states = await loadReactions(db, me(c).id, { type: target.type, id: target.id });
  return c.html(
    <Reactions
      type={target.type}
      id={target.id}
      score={target.score}
      clapCount={target.clapCount}
      state={states.get(reactionKey(target.type, target.id)) ?? EMPTY_REACTIONS}
      isOwn={false}
    />,
  );
};

export const reactionRoutes = new Hono<AppEnv>();

reactionRoutes.post("/votar", async (c) => {
  const form = await c.req.parseBody();
  const value = Number(form.value);
  if (value !== 1 && value !== -1) return badRequest(c, "Voto inválido.");

  const { target, error } = await resolveTarget(c, form);
  if (error) return error;

  await castVote(getDb(c.env.DB), me(c).id, target, value);
  return respond(c, target);
});

reactionRoutes.post("/aplaudir", async (c) => {
  const form = await c.req.parseBody();
  const count = Number(form.count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > MAX_CLAPS) {
    return badRequest(c, `Aplausos devem ser entre 1 e ${MAX_CLAPS}.`);
  }

  const { target, error } = await resolveTarget(c, form);
  if (error) return error;

  await addClaps(getDb(c.env.DB), me(c).id, target, count);
  return respond(c, target);
});
