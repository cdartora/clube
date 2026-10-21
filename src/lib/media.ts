// Fotos e vídeos guardados no R2 (binding MEDIA) e servidos pelo próprio Worker em /m/<chave>,
// então só quem passa pelo Access consegue ver.
//
// O Clube tem que caber no plano gratuito do R2 (10 GB guardados e 1 milhão de escritas por mês,
// somando todos os buckets da conta). Por isso cada arquivo fica registrado na tabela `media`, e o
// upload é recusado quando passaria do espaço reservado ao bucket (MEDIA_BUDGET_MB), da cota de
// cada pessoa ou do limite diário de envios. O navegador já reduz as fotos antes de enviar.

import { and, count, eq, gte, sum } from "drizzle-orm";
import { getDb } from "../db";
import { media } from "../db/schema";

const MB = 1024 * 1024;

// Fotos chegam já reduzidas pelo editor (~1600 px, poucos centos de KB); o limite cobre GIFs.
export const IMAGE_MAX = 5 * MB;
export const VIDEO_MAX = 25 * MB;
export const AVATAR_MAX = 2 * MB;

/** Quanto cada pessoa pode guardar, somando fotos e vídeos. */
export const USER_BUDGET = 1024 * MB;
/** Envios por pessoa em 24 horas: segura as escritas no R2 bem longe do limite gratuito. */
export const DAILY_UPLOADS = 50;
/** Espaço do bucket quando MEDIA_BUDGET_MB não está definido. */
const DEFAULT_BUDGET_MB = 1024;

type MediaType = { ext: string; contentType: string; video: boolean };

const JPEG: MediaType = { ext: "jpg", contentType: "image/jpeg", video: false };
const PNG: MediaType = { ext: "png", contentType: "image/png", video: false };
const GIF: MediaType = { ext: "gif", contentType: "image/gif", video: false };
const WEBP: MediaType = { ext: "webp", contentType: "image/webp", video: false };
const MP4: MediaType = { ext: "mp4", contentType: "video/mp4", video: true };
const WEBM: MediaType = { ext: "webm", contentType: "video/webm", video: true };

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

/**
 * Descobre o tipo pelo conteúdo, não pelo nome nem pelo Content-Type que o navegador mandou.
 * Qualquer outra coisa (SVG, HTML, PDF...) é recusada.
 */
export const sniffMediaType = (bytes: Uint8Array): MediaType | null => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return JPEG;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return GIF;
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return WEBP;
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return WEBM;
  if (ascii(bytes, 4, 8) === "ftyp") {
    // MP4 e MOV do celular (H.264) tocam no navegador como video/mp4. HEIC/AVIF também são "ftyp".
    const brand = ascii(bytes, 8, 12);
    if (["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "qt  "].includes(brand)) return MP4;
  }
  return null;
};

export type StoreResult =
  | { ok: true; key: string; video: boolean }
  | { ok: false; error: string; status: 400 | 413 | 429 | 507 };

const mb = (bytes: number) => `${Math.round(bytes / MB)} MB`;

export const budgetBytes = (env: Pick<Env, "MEDIA_BUDGET_MB">) => {
  const value = Number(env.MEDIA_BUDGET_MB);
  return (Number.isFinite(value) && value > 0 ? value : DEFAULT_BUDGET_MB) * MB;
};

/** Motivo para recusar mais `size` bytes desta pessoa, ou null se cabe. */
const quotaError = async (
  env: Pick<Env, "DB" | "MEDIA_BUDGET_MB">,
  userId: number,
  size: number,
): Promise<Extract<StoreResult, { ok: false }> | null> => {
  const db = getDb(env.DB);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [total, mine, today] = await Promise.all([
    db.select({ bytes: sum(media.size) }).from(media).get(),
    db.select({ bytes: sum(media.size) }).from(media).where(eq(media.userId, userId)).get(),
    db
      .select({ n: count() })
      .from(media)
      .where(and(eq(media.userId, userId), gte(media.createdAt, since)))
      .get(),
  ]);
  if (Number(total?.bytes ?? 0) + size > budgetBytes(env)) {
    return {
      ok: false,
      error: "O espaço de fotos e vídeos do Clube acabou. Avise quem administra o fórum.",
      status: 507,
    };
  }
  if (Number(mine?.bytes ?? 0) + size > USER_BUDGET) {
    return {
      ok: false,
      error: `Você já usou os seus ${mb(USER_BUDGET)} de fotos e vídeos. Apague posts antigos com mídia para liberar espaço.`,
      status: 413,
    };
  }
  if ((today?.n ?? 0) >= DAILY_UPLOADS) {
    return { ok: false, error: `Limite de ${DAILY_UPLOADS} envios por dia. Tente de novo amanhã.`, status: 429 };
  }
  return null;
};

/** Valida e grava o arquivo no R2. `folder` separa fotos de perfil das mídias dos posts. */
export const storeMedia = async (
  env: Pick<Env, "DB" | "MEDIA" | "MEDIA_BUDGET_MB">,
  file: File,
  { userId, folder, imagesOnly = false }: { userId: number; folder: "posts" | "avatars"; imagesOnly?: boolean },
): Promise<StoreResult> => {
  if (file.size === 0) return { ok: false, error: "O arquivo está vazio.", status: 400 };

  const type = sniffMediaType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!type || (imagesOnly && type.video)) {
    const accepted = imagesOnly ? "JPEG, PNG, GIF ou WebP" : "fotos (JPEG, PNG, GIF, WebP) ou vídeos (MP4, WebM)";
    return { ok: false, error: `Formato não aceito. Envie ${accepted}.`, status: 400 };
  }

  const max = folder === "avatars" ? AVATAR_MAX : type.video ? VIDEO_MAX : IMAGE_MAX;
  if (file.size > max) {
    return { ok: false, error: `Arquivo grande demais: o limite é ${mb(max)}.`, status: 413 };
  }

  const blocked = await quotaError(env, userId, file.size);
  if (blocked) return blocked;

  const key = `${folder}/${userId}/${crypto.randomUUID()}.${type.ext}`;
  await env.MEDIA.put(key, file, {
    httpMetadata: { contentType: type.contentType },
    customMetadata: { userId: String(userId), name: file.name.slice(0, 200) },
  });
  await getDb(env.DB).insert(media).values({ key, userId, size: file.size });
  return { ok: true, key, video: type.video };
};

/** Apaga um arquivo do R2 e o registro dele. */
export const deleteMedia = async (env: Pick<Env, "DB" | "MEDIA">, key: string) => {
  await env.MEDIA.delete(key);
  await getDb(env.DB).delete(media).where(eq(media.key, key));
};

export const mediaUrl = (key: string) => `/m/${key}`;

/** Só chaves no formato que o storeMedia gera; o resto nem chega no R2. */
export const MEDIA_KEY_RE = /^(posts|avatars)\/\d+\/[0-9a-f-]{36}\.(jpg|png|gif|webp|mp4|webm)$/;

/** Endereços de vídeo enviados ao Clube, que o Markdown mostra como <video> em vez de <img>. */
export const isVideoUrl = (src: string) => /^\/m\/posts\/\d+\/[0-9a-f-]{36}\.(mp4|webm)$/.test(src);

/** Texto em Markdown para colar no post. Usa a sintaxe de imagem também para vídeo. */
export const mediaMarkdown = (key: string, name: string) => {
  const alt = name.replace(/\.[^.]*$/, "").replace(/[[\]\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `![${alt}](${mediaUrl(key)})`;
};
