import { aliasedTable, and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { invites, replies, topics, users } from "../db/schema";

export const BIO_MAX = 500;
export const QUOTA_MAX = 50;

const inviter = aliasedTable(users, "inviter");

export type Profile = {
  id: number;
  username: string;
  displayName: string;
  bio: string;
  role: "admin" | "member";
  status: "active" | "disabled";
  createdAt: Date;
  inviterName: string | null;
  inviterUsername: string | null;
};

// Tipado à mão: com o leftJoin na tabela com alias, o Drizzle não consegue inferir o tipo.
export const loadProfile = (db: Db, username: string): Promise<Profile | undefined> =>
  db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      inviterName: inviter.displayName,
      inviterUsername: inviter.username,
    })
    .from(users)
    .leftJoin(inviter, eq(users.invitedBy, inviter.id))
    .where(eq(users.username, username))
    .get();


export const loadProfileActivity = async (db: Db, userId: number) => {
  const [topicStats, replyStats, recentTopics, recentReplies, invitees] = await Promise.all([
    db
      .select({ n: count(), claps: sql<number>`coalesce(sum(${topics.clapCount}), 0)` })
      .from(topics)
      .where(and(eq(topics.authorId, userId), isNull(topics.deletedAt)))
      .get(),
    db
      .select({ n: count(), claps: sql<number>`coalesce(sum(${replies.clapCount}), 0)` })
      .from(replies)
      .innerJoin(topics, eq(replies.topicId, topics.id))
      .where(and(eq(replies.authorId, userId), isNull(replies.deletedAt), isNull(topics.deletedAt)))
      .get(),
    db
      .select({ id: topics.id, title: topics.title, replyCount: topics.replyCount, createdAt: topics.createdAt })
      .from(topics)
      .where(and(eq(topics.authorId, userId), isNull(topics.deletedAt)))
      .orderBy(desc(topics.createdAt), desc(topics.id))
      .limit(20)
      .all(),
    db
      .select({
        id: replies.id,
        topicId: replies.topicId,
        topicTitle: topics.title,
        bodyMd: replies.bodyMd,
        createdAt: replies.createdAt,
      })
      .from(replies)
      .innerJoin(topics, eq(replies.topicId, topics.id))
      .where(and(eq(replies.authorId, userId), isNull(replies.deletedAt), isNull(topics.deletedAt)))
      .orderBy(desc(replies.createdAt), desc(replies.id))
      .limit(10)
      .all(),
    db
      .select({ username: users.username, displayName: users.displayName })
      .from(users)
      .where(eq(users.invitedBy, userId))
      .orderBy(users.createdAt)
      .all(),
  ]);
  return {
    topicCount: topicStats?.n ?? 0,
    replyCount: replyStats?.n ?? 0,
    clapsReceived: (topicStats?.claps ?? 0) + (replyStats?.claps ?? 0),
    recentTopics,
    recentReplies,
    invitees,
  };
};

export type ProfileActivity = Awaited<ReturnType<typeof loadProfileActivity>>;

export type MemberRow = {
  id: number;
  email: string;
  username: string;
  displayName: string;
  role: "admin" | "member";
  status: "active" | "disabled";
  inviteQuota: number;
  createdAt: Date;
  inviterName: string | null;
  invitesUsed: number;
};

/** Lista de membros para o painel do admin, com quantos convites cada um já usou. */
export const listMembers = async (db: Db): Promise<MemberRow[]> => {
  // Tipado à mão: com o leftJoin na tabela com alias, o Drizzle não consegue inferir o tipo das linhas.
  const [rows, used]: [Omit<MemberRow, "invitesUsed">[], { userId: number; n: number }[]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
        inviteQuota: users.inviteQuota,
        createdAt: users.createdAt,
        inviterName: inviter.displayName,
      })
      .from(users)
      .leftJoin(inviter, eq(users.invitedBy, inviter.id))
      .orderBy(users.createdAt, users.id)
      .all(),
    db
      .select({ userId: invites.invitedBy, n: count() })
      .from(invites)
      .where(inArray(invites.status, ["pending", "accepted"]))
      .groupBy(invites.invitedBy)
      .all(),
  ]);
  const usedBy = new Map(used.map((u) => [u.userId, u.n]));
  return rows.map((r) => ({ ...r, invitesUsed: usedBy.get(r.id) ?? 0 }));
};
