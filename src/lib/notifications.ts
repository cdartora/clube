import { aliasedTable, and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { notifications, replies, topics, users } from "../db/schema";

/** Avisa o dono do post respondido (o tópico ou a resposta-mãe). Ninguém é avisado da própria resposta. */
export const notifyReply = async (
  db: Db,
  args: { recipientId: number; actorId: number; topicId: number; replyId: number },
) => {
  if (args.recipientId === args.actorId) return;
  await db.insert(notifications).values({
    userId: args.recipientId,
    actorId: args.actorId,
    type: "reply",
    topicId: args.topicId,
    replyId: args.replyId,
  });
};

/** Um post não avisa mais que isso de pessoas de uma vez. */
export const MAX_MENTIONS = 10;

/**
 * Avisa quem foi mencionado com @apelido. Não avisa o autor, membros desativados nem quem
 * já vai receber outro aviso pelo mesmo post (`skip`, por exemplo o dono do post respondido).
 */
export const notifyMentions = async (
  db: Db,
  args: { usernames: string[]; actorId: number; topicId: number; replyId: number | null; skip?: number[] },
) => {
  const usernames = args.usernames.slice(0, MAX_MENTIONS);
  if (usernames.length === 0) return;
  const skip = new Set([args.actorId, ...(args.skip ?? [])]);
  const mentioned = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.username, usernames), eq(users.status, "active")))
    .all();
  const rows = mentioned
    .filter((u) => !skip.has(u.id))
    .map((u) => ({ userId: u.id, actorId: args.actorId, type: "mention" as const, topicId: args.topicId, replyId: args.replyId }));
  if (rows.length > 0) await db.insert(notifications).values(rows);
};

/**
 * Aplausos viram um aviso só por post enquanto ele não for lido: novos aplausos
 * atualizam quem aplaudiu por último e trazem o aviso para o topo.
 */
export const notifyClap = async (
  db: Db,
  args: { recipientId: number; actorId: number; topicId: number; replyId: number | null },
) => {
  if (args.recipientId === args.actorId) return;
  const sameTarget = and(
    eq(notifications.userId, args.recipientId),
    eq(notifications.type, "clap"),
    eq(notifications.topicId, args.topicId),
    args.replyId === null ? isNull(notifications.replyId) : eq(notifications.replyId, args.replyId),
    isNull(notifications.readAt),
  );
  const existing = await db.select({ id: notifications.id }).from(notifications).where(sameTarget).get();
  if (existing) {
    await db
      .update(notifications)
      .set({ actorId: args.actorId, createdAt: new Date() })
      .where(eq(notifications.id, existing.id));
  } else {
    await db.insert(notifications).values({ ...args, userId: args.recipientId, type: "clap" });
  }
};

/** Avisos não lidos de posts que ainda existem. */
const visible = (userId: number) =>
  and(eq(notifications.userId, userId), isNull(topics.deletedAt), isNull(replies.deletedAt));

export const countUnread = async (db: Db, userId: number) => {
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .innerJoin(topics, eq(notifications.topicId, topics.id))
    .leftJoin(replies, eq(notifications.replyId, replies.id))
    .where(and(visible(userId), isNull(notifications.readAt)))
    .get();
  return row?.n ?? 0;
};

const actor = aliasedTable(users, "actor");

export const listNotifications = (db: Db, userId: number, limit = 50) =>
  db
    .select({
      id: notifications.id,
      type: notifications.type,
      topicId: notifications.topicId,
      topicTitle: topics.title,
      replyId: notifications.replyId,
      // Para respostas: true se responderam a uma resposta sua (e não ao seu tópico).
      isReplyToReply: sql<number>`${replies.parentId} IS NOT NULL`,
      actorName: actor.displayName,
      // Para aplausos: quantas outras pessoas também aplaudiram o post.
      otherClappers: sql<number>`(SELECT count(*) FROM claps c
        WHERE c.target_type = CASE WHEN ${notifications.replyId} IS NULL THEN 'topic' ELSE 'reply' END
          AND c.target_id = coalesce(${notifications.replyId}, ${notifications.topicId})
          AND c.user_id != ${notifications.actorId})`,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .innerJoin(topics, eq(notifications.topicId, topics.id))
    .leftJoin(replies, eq(notifications.replyId, replies.id))
    .innerJoin(actor, eq(notifications.actorId, actor.id))
    .where(visible(userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit)
    .all();

export type NotificationRow = Awaited<ReturnType<typeof listNotifications>>[number];

export const markTopicNotificationsRead = (db: Db, userId: number, topicId: number) =>
  db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.topicId, topicId), isNull(notifications.readAt)),
    );

export const markAllRead = (db: Db, userId: number) =>
  db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
