import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { invites, type User, users } from "../db/schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (raw: unknown) => String(raw ?? "").trim().toLowerCase();

export const emailError = (email: string) =>
  !email ? "Informe o email da pessoa." : EMAIL_RE.test(email) ? undefined : "Esse email não parece válido.";

/** Quantos convites o membro ainda pode fazer. Admin não tem limite. Cancelados devolvem a cota. */
export const invitesLeft = async (db: Db, user: User) => {
  if (user.role === "admin") return Number.POSITIVE_INFINITY;
  const used = await db
    .select({ n: count() })
    .from(invites)
    .where(and(eq(invites.invitedBy, user.id), inArray(invites.status, ["pending", "accepted"])))
    .get();
  return Math.max(user.inviteQuota - (used?.n ?? 0), 0);
};

export const listInvitesBy = (db: Db, userId: number) =>
  db
    .select({
      id: invites.id,
      email: invites.email,
      status: invites.status,
      createdAt: invites.createdAt,
      memberName: users.displayName,
    })
    .from(invites)
    .leftJoin(users, eq(users.email, invites.email))
    .where(eq(invites.invitedBy, userId))
    .orderBy(desc(invites.createdAt), desc(invites.id))
    .all();

export type InviteRow = Awaited<ReturnType<typeof listInvitesBy>>[number];

/** Motivo para não poder convidar este email, ou null se pode. */
export const inviteBlocker = async (db: Db, email: string) => {
  const member = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (member) return `${member.displayName} já faz parte do Clube.`;

  const pending = await db
    .select({ inviter: users.displayName })
    .from(invites)
    .innerJoin(users, eq(invites.invitedBy, users.id))
    .where(and(eq(invites.email, email), eq(invites.status, "pending")))
    .get();
  if (pending) return `Essa pessoa já foi convidada por ${pending.inviter} e ainda não entrou.`;
  return null;
};
