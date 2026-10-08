import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { topicReads } from "../db/schema";

export const getLastRead = async (db: Db, userId: number, topicId: number) =>
  (
    await db
      .select({ at: topicReads.lastReadAt })
      .from(topicReads)
      .where(and(eq(topicReads.userId, userId), eq(topicReads.topicId, topicId)))
      .get()
  )?.at ?? null;

export const markTopicRead = (db: Db, userId: number, topicId: number, at = new Date()) =>
  db
    .insert(topicReads)
    .values({ userId, topicId, lastReadAt: at })
    .onConflictDoUpdate({ target: [topicReads.userId, topicReads.topicId], set: { lastReadAt: at } });

/** "novo" = nunca aberto; "updated" = tem atividade depois da última visita. */
export type ReadState = "new" | "updated" | "read";

export const readState = (lastActivityAt: Date, lastReadAt: Date | null): ReadState =>
  lastReadAt === null ? "new" : lastActivityAt > lastReadAt ? "updated" : "read";
