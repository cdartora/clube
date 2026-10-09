import { aliasedTable, and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { AppEnv } from "../auth/middleware";
import { type Db, getDb } from "../db";
import { replies, topicReads, topics, type User, users } from "../db/schema";
import { renderMarkdown } from "../lib/markdown";
import { countUnread, markTopicNotificationsRead, notifyReply } from "../lib/notifications";
import { loadReactions } from "../lib/reactions";
import { getLastRead, markTopicRead, readState } from "../lib/reads";
import {
  bodyError,
  canDelete,
  canEdit,
  cleanBody,
  cleanTitle,
  type PostErrors,
  titleError,
} from "../lib/posts";
import { buildTree } from "../lib/tree";
import { ErrorPage } from "../views/errors";
import { HomePage, type TopicRow } from "../views/home";
import { TopicFormPage } from "../views/topic-form";
import {
  EditReplyPage,
  ReplyForm,
  ReplyPage,
  type ReplyView,
  TopicPage,
  type TopicView,
} from "../views/topic";

// Rotas de membros: o requireMember já rodou, então o usuário existe.
const me = (c: Context<AppEnv>) => c.get("user") as User;

const notFound = (c: Context<AppEnv>) =>
  c.html(
    <ErrorPage title="Não encontrado">
      Esse conteúdo não existe ou foi removido. <a href="/">Voltar ao índice</a>
    </ErrorPage>,
    404,
  );

const forbidden = (c: Context<AppEnv>) =>
  c.html(<ErrorPage title="Sem permissão">Você não pode fazer isso.</ErrorPage>, 403);

const loadTopic = (db: Db, id: number): Promise<TopicView | undefined> =>
  db
    .select({
      id: topics.id,
      title: topics.title,
      bodyMd: topics.bodyMd,
      authorId: topics.authorId,
      authorName: users.displayName,
      authorUsername: users.username,
      replyCount: topics.replyCount,
      score: topics.score,
      clapCount: topics.clapCount,
      createdAt: topics.createdAt,
      updatedAt: topics.updatedAt,
    })
    .from(topics)
    .innerJoin(users, eq(topics.authorId, users.id))
    .where(and(eq(topics.id, id), isNull(topics.deletedAt)))
    .get();

const replySelect = {
  id: replies.id,
  topicId: replies.topicId,
  parentId: replies.parentId,
  bodyMd: replies.bodyMd,
  authorId: replies.authorId,
  authorName: users.displayName,
  authorUsername: users.username,
  score: replies.score,
  clapCount: replies.clapCount,
  createdAt: replies.createdAt,
  updatedAt: replies.updatedAt,
  deletedAt: replies.deletedAt,
};

const loadReplies = (db: Db, topicId: number): Promise<ReplyView[]> =>
  db
    .select(replySelect)
    .from(replies)
    .innerJoin(users, eq(replies.authorId, users.id))
    .where(eq(replies.topicId, topicId))
    .all();

/** Resposta não apagada, num tópico não apagado. */
const loadReply = (db: Db, id: number) =>
  db
    .select({ ...replySelect, topicTitle: topics.title })
    .from(replies)
    .innerJoin(users, eq(replies.authorId, users.id))
    .innerJoin(topics, eq(replies.topicId, topics.id))
    .where(and(eq(replies.id, id), isNull(replies.deletedAt), isNull(topics.deletedAt)))
    .get();

const parseId = (raw: string | undefined) => {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export const topicRoutes = new Hono<AppEnv>();

// --- Índice ---

// Cliques repetidos em "Responder" mandam o mesmo texto várias vezes.
const DUPLICATE_WINDOW_MS = 60_000;

/** Resposta idêntica que a mesma pessoa acabou de publicar no mesmo lugar, se houver. */
const findRecentDuplicate = (
  db: Db,
  reply: { topicId: number; parentId: number | null; authorId: number; bodyMd: string },
  now: Date,
) =>
  db
    .select({ id: replies.id })
    .from(replies)
    .where(
      and(
        eq(replies.topicId, reply.topicId),
        reply.parentId ? eq(replies.parentId, reply.parentId) : isNull(replies.parentId),
        eq(replies.authorId, reply.authorId),
        eq(replies.bodyMd, reply.bodyMd),
        isNull(replies.deletedAt),
        gte(replies.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS)),
      ),
    )
    .get();

const lastReplier = aliasedTable(users, "last_replier");

type IndexRow = Omit<TopicRow, "readState"> & { lastReadAt: Date | null };

topicRoutes.get("/", async (c) => {
  // Anotado à mão: com dois leftJoin o Drizzle não consegue inferir o tipo das linhas.
  const rows: IndexRow[] = await getDb(c.env.DB)
    .select({
      id: topics.id,
      title: topics.title,
      author: users.displayName,
      authorUsername: users.username,
      replyCount: topics.replyCount,
      lastActivityAt: topics.lastActivityAt,
      lastReplyBy: lastReplier.displayName,
      lastReadAt: topicReads.lastReadAt,
    })
    .from(topics)
    .innerJoin(users, eq(topics.authorId, users.id))
    .leftJoin(lastReplier, eq(topics.lastReplyBy, lastReplier.id))
    .leftJoin(topicReads, and(eq(topicReads.topicId, topics.id), eq(topicReads.userId, me(c).id)))
    .where(isNull(topics.deletedAt))
    .orderBy(desc(topics.lastActivityAt), desc(topics.id))
    .limit(50)
    .all();

  const withState = rows.map((t) => ({ ...t, readState: readState(t.lastActivityAt, t.lastReadAt) }));
  return c.html(<HomePage topics={withState} user={me(c)} />);
});

// --- Tópicos ---

topicRoutes.get("/novo", (c) =>
  c.html(<TopicFormPage user={me(c)} mode="new" action="/novo" />),
);

topicRoutes.post("/novo", async (c) => {
  const form = await c.req.parseBody();
  const values = { title: cleanTitle(form.title), body: cleanBody(form.body) };
  const errors: PostErrors = { title: titleError(values.title), body: bodyError(values.body) };
  if (errors.title || errors.body) {
    return c.html(
      <TopicFormPage user={me(c)} mode="new" action="/novo" values={values} errors={errors} />,
      400,
    );
  }

  const created = await getDb(c.env.DB)
    .insert(topics)
    .values({ authorId: me(c).id, title: values.title, bodyMd: values.body })
    .returning({ id: topics.id })
    .get();
  return c.redirect(`/t/${created.id}`, 303);
});

topicRoutes.get("/t/:id{[0-9]+}", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const topic = await loadTopic(db, id);
  if (!topic) return notFound(c);

  const user = me(c);
  const [replyRows, reactions, previousRead] = await Promise.all([
    loadReplies(db, id),
    loadReactions(db, user.id, { topicId: id }),
    getLastRead(db, user.id, id),
  ]);

  // Abrir o tópico marca como lido, junto com as notificações dele.
  await db.batch([markTopicRead(db, user.id, id), markTopicNotificationsRead(db, user.id, id)]);
  const unreadCount = await countUnread(db, user.id);

  return c.html(
    <TopicPage
      topic={topic}
      replies={buildTree(replyRows)}
      user={{ ...user, unreadCount }}
      reactions={reactions}
      newSince={previousRead}
    />,
  );
});

topicRoutes.get("/t/:id{[0-9]+}/editar", async (c) => {
  const topic = await loadTopic(getDb(c.env.DB), Number(c.req.param("id")));
  if (!topic) return notFound(c);
  if (!canEdit(me(c), topic.authorId)) return forbidden(c);

  return c.html(
    <TopicFormPage
      user={me(c)}
      mode="edit"
      action={`/t/${topic.id}/editar`}
      values={{ title: topic.title, body: topic.bodyMd }}
    />,
  );
});

topicRoutes.post("/t/:id{[0-9]+}/editar", async (c) => {
  const db = getDb(c.env.DB);
  const topic = await loadTopic(db, Number(c.req.param("id")));
  if (!topic) return notFound(c);
  if (!canEdit(me(c), topic.authorId)) return forbidden(c);

  const form = await c.req.parseBody();
  const values = { title: cleanTitle(form.title), body: cleanBody(form.body) };
  const errors: PostErrors = { title: titleError(values.title), body: bodyError(values.body) };
  if (errors.title || errors.body) {
    return c.html(
      <TopicFormPage
        user={me(c)}
        mode="edit"
        action={`/t/${topic.id}/editar`}
        values={values}
        errors={errors}
      />,
      400,
    );
  }

  await db
    .update(topics)
    .set({ title: values.title, bodyMd: values.body, updatedAt: new Date() })
    .where(eq(topics.id, topic.id));
  return c.redirect(`/t/${topic.id}`, 303);
});

topicRoutes.post("/t/:id{[0-9]+}/apagar", async (c) => {
  const db = getDb(c.env.DB);
  const topic = await loadTopic(db, Number(c.req.param("id")));
  if (!topic) return notFound(c);
  if (!canDelete(me(c), topic.authorId)) return forbidden(c);

  await db.update(topics).set({ deletedAt: new Date() }).where(eq(topics.id, topic.id));
  return c.redirect("/", 303);
});

// --- Respostas ---

topicRoutes.get("/t/:id{[0-9]+}/responder", async (c) => {
  const db = getDb(c.env.DB);
  const topic = await loadTopic(db, Number(c.req.param("id")));
  if (!topic) return notFound(c);

  const parentId = parseId(c.req.query("para"));
  const parent = parentId ? await loadReply(db, parentId) : null;
  if (parentId && (!parent || parent.topicId !== topic.id)) return notFound(c);

  // Pedido do htmx: só o formulário, para encaixar embaixo da resposta.
  if (c.req.header("HX-Request")) {
    return c.html(<ReplyForm topicId={topic.id} parentId={parentId} inline />);
  }
  return c.html(<ReplyPage topic={topic} parent={parent ?? null} user={me(c)} />);
});

topicRoutes.post("/t/:id{[0-9]+}/respostas", async (c) => {
  const db = getDb(c.env.DB);
  const topic = await loadTopic(db, Number(c.req.param("id")));
  if (!topic) return notFound(c);

  const form = await c.req.parseBody();
  const body = cleanBody(form.body);
  const parentId = form.parentId ? parseId(String(form.parentId)) : null;
  const parent = parentId ? await loadReply(db, parentId) : null;
  if (form.parentId && (!parent || parent.topicId !== topic.id)) return notFound(c);

  const error = bodyError(body);
  if (error) {
    return c.html(
      <ReplyPage topic={topic} parent={parent ?? null} user={me(c)} value={body} error={error} />,
      400,
    );
  }

  const now = new Date();
  const duplicate = await findRecentDuplicate(
    db,
    { topicId: topic.id, parentId, authorId: me(c).id, bodyMd: body },
    now,
  );
  if (duplicate) return c.redirect(`/t/${topic.id}#r-${duplicate.id}`, 303);

  const [inserted] = await db.batch([
    db
      .insert(replies)
      .values({ topicId: topic.id, parentId, authorId: me(c).id, bodyMd: body, createdAt: now })
      .returning({ id: replies.id }),
    db
      .update(topics)
      .set({
        replyCount: sql`${topics.replyCount} + 1`,
        lastReplyAt: now,
        lastReplyBy: me(c).id,
        lastActivityAt: now,
      })
      .where(eq(topics.id, topic.id)),
  ]);
  await notifyReply(db, {
    recipientId: parent ? parent.authorId : topic.authorId,
    actorId: me(c).id,
    topicId: topic.id,
    replyId: inserted[0].id,
  });
  return c.redirect(`/t/${topic.id}#r-${inserted[0].id}`, 303);
});

topicRoutes.get("/r/:id{[0-9]+}/editar", async (c) => {
  const reply = await loadReply(getDb(c.env.DB), Number(c.req.param("id")));
  if (!reply) return notFound(c);
  if (!canEdit(me(c), reply.authorId)) return forbidden(c);

  return c.html(
    <EditReplyPage
      topic={{ id: reply.topicId, title: reply.topicTitle }}
      replyId={reply.id}
      user={me(c)}
      value={reply.bodyMd}
    />,
  );
});

topicRoutes.post("/r/:id{[0-9]+}/editar", async (c) => {
  const db = getDb(c.env.DB);
  const reply = await loadReply(db, Number(c.req.param("id")));
  if (!reply) return notFound(c);
  if (!canEdit(me(c), reply.authorId)) return forbidden(c);

  const body = cleanBody((await c.req.parseBody()).body);
  const error = bodyError(body);
  if (error) {
    return c.html(
      <EditReplyPage
        topic={{ id: reply.topicId, title: reply.topicTitle }}
        replyId={reply.id}
        user={me(c)}
        value={body}
        error={error}
      />,
      400,
    );
  }

  await db.update(replies).set({ bodyMd: body, updatedAt: new Date() }).where(eq(replies.id, reply.id));
  return c.redirect(`/t/${reply.topicId}#r-${reply.id}`, 303);
});

topicRoutes.post("/r/:id{[0-9]+}/apagar", async (c) => {
  const db = getDb(c.env.DB);
  const reply = await loadReply(db, Number(c.req.param("id")));
  if (!reply) return notFound(c);
  if (!canDelete(me(c), reply.authorId)) return forbidden(c);

  await db.batch([
    db.update(replies).set({ deletedAt: new Date() }).where(eq(replies.id, reply.id)),
    db
      .update(topics)
      .set({ replyCount: sql`max(${topics.replyCount} - 1, 0)` })
      .where(eq(topics.id, reply.topicId)),
  ]);
  return c.redirect(`/t/${reply.topicId}`, 303);
});

// --- Prévia do editor ---

topicRoutes.post("/preview", async (c) => {
  const body = cleanBody((await c.req.parseBody()).body);
  if (!body) return c.html(<p class="muted">Nada para visualizar ainda.</p>);
  return c.html(renderMarkdown(body));
});
