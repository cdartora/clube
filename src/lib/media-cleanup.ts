// Limpeza diária do R2 (Cron Trigger, veja `triggers` no wrangler.jsonc).
//
// Arquivos ficam órfãos quando alguém envia uma foto e desiste do post, tira a foto ao editar
// ou apaga o post. Aqui o bucket é comparado com o que os posts e perfis ainda mostram, e o que
// sobra é apagado. A tabela `media` também é acertada com o bucket: entram arquivos que ela não
// conhecia (enviados antes dela existir) e saem registros de arquivos que já não estão lá.

import { and, eq, inArray, isNotNull, isNull, like } from "drizzle-orm";
import { getDb } from "../db";
import { media, replies, topics, users } from "../db/schema";

/** Tempo para terminar um post depois de enviar a foto: antes disso nada é apagado. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

// O D1 aceita até 100 parâmetros por consulta.
const CHUNK = 25;

const chunks = <T>(list: T[], size = CHUNK) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

const MEDIA_IN_TEXT_RE = /\/m\/((?:posts|avatars)\/\d+\/[0-9a-f-]{36}\.[a-z0-9]+)/g;

/** Chaves que algum post visível ou perfil ainda usa. */
const referencedKeys = async (db: ReturnType<typeof getDb>) => {
  const [topicBodies, replyBodies, avatars] = await Promise.all([
    db
      .select({ body: topics.bodyMd })
      .from(topics)
      .where(and(isNull(topics.deletedAt), like(topics.bodyMd, "%/m/%")))
      .all(),
    db
      .select({ body: replies.bodyMd })
      .from(replies)
      .innerJoin(topics, eq(replies.topicId, topics.id))
      .where(and(isNull(replies.deletedAt), isNull(topics.deletedAt), like(replies.bodyMd, "%/m/%")))
      .all(),
    db.select({ key: users.avatarKey }).from(users).where(isNotNull(users.avatarKey)).all(),
  ]);

  const keys = new Set<string>();
  for (const { body } of [...topicBodies, ...replyBodies]) {
    for (const match of body.matchAll(MEDIA_IN_TEXT_RE)) keys.add(match[1]);
  }
  for (const { key } of avatars) if (key) keys.add(key);
  return keys;
};

const listBucket = async (bucket: R2Bucket) => {
  const objects: { key: string; size: number; uploaded: Date; userId: number | null }[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ cursor, include: ["customMetadata"] });
    for (const o of page.objects) {
      const userId = Number(o.customMetadata?.userId ?? o.key.split("/")[1]);
      objects.push({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded,
        userId: Number.isSafeInteger(userId) && userId > 0 ? userId : null,
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
};

export type CleanupResult = { deleted: number; freedBytes: number; adopted: number; forgotten: number };

export const cleanupMedia = async (env: Pick<Env, "DB" | "MEDIA">, now = new Date()): Promise<CleanupResult> => {
  const db = getDb(env.DB);
  const [objects, referenced, known] = await Promise.all([
    listBucket(env.MEDIA),
    referencedKeys(db),
    db.select({ key: media.key }).from(media).all(),
  ]);

  const cutoff = now.getTime() - ORPHAN_GRACE_MS;
  const orphans = objects.filter((o) => o.uploaded.getTime() < cutoff && !referenced.has(o.key));
  const orphanKeys = new Set(orphans.map((o) => o.key));

  // O R2 apaga até 1000 chaves por chamada (e apagar não conta como escrita no plano gratuito).
  for (const batch of chunks(orphans.map((o) => o.key), 1000)) await env.MEDIA.delete(batch);

  // Acerta a tabela com o bucket.
  const inBucket = new Set(objects.map((o) => o.key));
  const knownKeys = new Set(known.map((m) => m.key));
  const forget = known.map((m) => m.key).filter((k) => orphanKeys.has(k) || !inBucket.has(k));
  const adopt = objects.filter((o) => !orphanKeys.has(o.key) && !knownKeys.has(o.key) && o.userId !== null);

  const writes = [
    ...chunks(forget, 90).map((keys) => db.delete(media).where(inArray(media.key, keys))),
    ...chunks(adopt).map((rows) =>
      db
        .insert(media)
        .values(rows.map((o) => ({ key: o.key, userId: o.userId!, size: o.size, createdAt: o.uploaded })))
        .onConflictDoNothing(),
    ),
  ];
  if (writes.length > 0) await db.batch(writes as [(typeof writes)[number], ...typeof writes]);

  return {
    deleted: orphans.length,
    freedBytes: orphans.reduce((total, o) => total + o.size, 0),
    adopted: adopt.length,
    forgotten: forget.length,
  };
};
