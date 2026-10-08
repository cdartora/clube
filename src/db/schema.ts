import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  inviteQuota: integer("invite_quota").notNull().default(1),
  invitedBy: integer("invited_by").references((): AnySQLiteColumn => users.id),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  createdAt: createdAt(),
});

export const invites = sqliteTable(
  "invites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    invitedBy: integer("invited_by")
      .notNull()
      .references(() => users.id),
    status: text("status", { enum: ["pending", "accepted", "canceled"] })
      .notNull()
      .default("pending"),
    createdAt: createdAt(),
    acceptedAt: integer("accepted_at", { mode: "timestamp" }),
  },
  (t) => [index("invites_email_idx").on(t.email), index("invites_invited_by_idx").on(t.invitedBy)],
);

export const topics = sqliteTable(
  "topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    replyCount: integer("reply_count").notNull().default(0),
    score: integer("score").notNull().default(0),
    clapCount: integer("clap_count").notNull().default(0),
    lastReplyAt: integer("last_reply_at", { mode: "timestamp" }),
    lastReplyBy: integer("last_reply_by").references(() => users.id),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (t) => [index("topics_last_activity_idx").on(t.lastActivityAt)],
);

// Respostas formam uma árvore: parentId nulo = resposta direta ao tópico.
export const replies = sqliteTable(
  "replies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id),
    parentId: integer("parent_id").references((): AnySQLiteColumn => replies.id),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    bodyMd: text("body_md").notNull(),
    score: integer("score").notNull().default(0),
    clapCount: integer("clap_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (t) => [index("replies_topic_idx").on(t.topicId)],
);

const targetType = () => text("target_type", { enum: ["topic", "reply"] }).notNull();

// Voto anônimo: +1 ou -1 por pessoa. A soma fica em topics.score / replies.score.
export const votes = sqliteTable(
  "votes",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    targetType: targetType(),
    targetId: integer("target_id").notNull(),
    value: integer("value").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    check("votes_value_check", sql`${t.value} IN (-1, 1)`),
  ],
);

// Aplausos (estilo Medium): públicos, até MAX_CLAPS por pessoa em cada post.
export const MAX_CLAPS = 50;

export const claps = sqliteTable(
  "claps",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    targetType: targetType(),
    targetId: integer("target_id").notNull(),
    count: integer("count").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    index("claps_target_idx").on(t.targetType, t.targetId),
    check("claps_count_check", sql`${t.count} BETWEEN 1 AND ${sql.raw(String(MAX_CLAPS))}`),
  ],
);

// Marcador de "novo": última vez que o usuário abriu o tópico.
export const topicReads = sqliteTable(
  "topic_reads",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id),
    lastReadAt: integer("last_read_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicId] })],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    actorId: integer("actor_id")
      .notNull()
      .references(() => users.id),
    type: text("type", { enum: ["reply", "clap"] }).notNull(),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id),
    replyId: integer("reply_id").references(() => replies.id),
    readAt: integer("read_at", { mode: "timestamp" }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export type User = typeof users.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Reply = typeof replies.$inferSelect;
