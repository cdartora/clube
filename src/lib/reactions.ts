import { and, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db";
import { claps, MAX_CLAPS, replies, type TargetType, topics, users, votes } from "../db/schema";

export type Clapper = { name: string; count: number };

export type ReactionState = {
  myVote: -1 | 0 | 1;
  myClaps: number;
  clappers: Clapper[];
};

export const EMPTY_REACTIONS: ReactionState = { myVote: 0, myClaps: 0, clappers: [] };

export const reactionKey = (type: TargetType, id: number) => `${type}:${id}`;

export type Target = {
  type: TargetType;
  id: number;
  topicId: number;
  authorId: number;
  score: number;
  clapCount: number;
};

/** Tópico ou resposta que ainda existe (não apagado, em tópico não apagado). */
export const loadTarget = async (db: Db, type: TargetType, id: number): Promise<Target | undefined> => {
  if (type === "topic") {
    const t = await db
      .select({ authorId: topics.authorId, score: topics.score, clapCount: topics.clapCount })
      .from(topics)
      .where(and(eq(topics.id, id), isNull(topics.deletedAt)))
      .get();
    return t && { type, id, topicId: id, ...t };
  }
  const r = await db
    .select({
      topicId: replies.topicId,
      authorId: replies.authorId,
      score: replies.score,
      clapCount: replies.clapCount,
    })
    .from(replies)
    .innerJoin(topics, eq(replies.topicId, topics.id))
    .where(and(eq(replies.id, id), isNull(replies.deletedAt), isNull(topics.deletedAt)))
    .get();
  return r && { type, id, ...r };
};

type Scope = { topicId: number } | { type: TargetType; id: number };

/** Filtra votos/aplausos de um alvo só, ou do tópico inteiro (o tópico e todas as respostas). */
const scopeFilter = (
  db: Db,
  cols: typeof votes | typeof claps,
  scope: Scope,
): SQL | undefined => {
  if ("type" in scope) return and(eq(cols.targetType, scope.type), eq(cols.targetId, scope.id));
  return or(
    and(eq(cols.targetType, "topic"), eq(cols.targetId, scope.topicId)),
    and(
      eq(cols.targetType, "reply"),
      inArray(
        cols.targetId,
        db.select({ id: replies.id }).from(replies).where(eq(replies.topicId, scope.topicId)),
      ),
    ),
  );
};

/** Meu voto, meus aplausos e quem aplaudiu, para cada alvo do escopo. */
export const loadReactions = async (db: Db, userId: number, scope: Scope) => {
  const [myVotes, allClaps] = await Promise.all([
    db
      .select({ type: votes.targetType, id: votes.targetId, value: votes.value })
      .from(votes)
      .where(and(eq(votes.userId, userId), scopeFilter(db, votes, scope)))
      .all(),
    db
      .select({
        type: claps.targetType,
        id: claps.targetId,
        userId: claps.userId,
        count: claps.count,
        name: users.displayName,
      })
      .from(claps)
      .innerJoin(users, eq(claps.userId, users.id))
      .where(scopeFilter(db, claps, scope))
      .orderBy(desc(claps.count), claps.updatedAt)
      .all(),
  ]);

  const states = new Map<string, ReactionState>();
  const stateFor = (type: TargetType, id: number) => {
    const key = reactionKey(type, id);
    let s = states.get(key);
    if (!s) {
      s = { myVote: 0, myClaps: 0, clappers: [] };
      states.set(key, s);
    }
    return s;
  };

  for (const v of myVotes) stateFor(v.type, v.id).myVote = v.value as -1 | 1;
  for (const c of allClaps) {
    const s = stateFor(c.type, c.id);
    s.clappers.push({ name: c.userId === userId ? "Você" : c.name, count: c.count });
    if (c.userId === userId) s.myClaps = c.count;
  }
  return states;
};

// Os totais são recalculados a partir das tabelas de votos e aplausos, então
// nunca saem do lugar, mesmo com cliques simultâneos.

const recomputeScore = (db: Db, type: TargetType, id: number) => {
  const total = sql`(SELECT coalesce(sum(${votes.value}), 0) FROM ${votes} WHERE ${votes.targetType} = ${type} AND ${votes.targetId} = ${id})`;
  return type === "topic"
    ? db.update(topics).set({ score: total }).where(eq(topics.id, id))
    : db.update(replies).set({ score: total }).where(eq(replies.id, id));
};

const recomputeClaps = (db: Db, type: TargetType, id: number) => {
  const total = sql`(SELECT coalesce(sum(${claps.count}), 0) FROM ${claps} WHERE ${claps.targetType} = ${type} AND ${claps.targetId} = ${id})`;
  return type === "topic"
    ? db.update(topics).set({ clapCount: total }).where(eq(topics.id, id))
    : db.update(replies).set({ clapCount: total }).where(eq(replies.id, id));
};

/**
 * Registra um voto. Votar de novo no mesmo sentido desfaz; no sentido
 * contrário, troca.
 */
export const castVote = async (db: Db, userId: number, target: Target, value: 1 | -1) => {
  const key = and(
    eq(votes.userId, userId),
    eq(votes.targetType, target.type),
    eq(votes.targetId, target.id),
  );
  const existing = await db.select({ value: votes.value }).from(votes).where(key).get();

  const write =
    existing?.value === value
      ? db.delete(votes).where(key)
      : db
          .insert(votes)
          .values({ userId, targetType: target.type, targetId: target.id, value })
          .onConflictDoUpdate({
            target: [votes.userId, votes.targetType, votes.targetId],
            set: { value },
          });

  await db.batch([write, recomputeScore(db, target.type, target.id)]);
};

/** Soma aplausos, sem passar de MAX_CLAPS por pessoa. */
export const addClaps = async (db: Db, userId: number, target: Target, count: number) => {
  await db.batch([
    db
      .insert(claps)
      .values({ userId, targetType: target.type, targetId: target.id, count: Math.min(count, MAX_CLAPS) })
      .onConflictDoUpdate({
        target: [claps.userId, claps.targetType, claps.targetId],
        set: {
          count: sql`min(${claps.count} + excluded.count, ${MAX_CLAPS})`,
          updatedAt: sql`(unixepoch())`,
        },
      }),
    recomputeClaps(db, target.type, target.id),
  ]);
};
