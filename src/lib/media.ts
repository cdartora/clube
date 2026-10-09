// Fotos e vídeos guardados no R2 (binding MEDIA) e servidos pelo próprio Worker em /m/<chave>,
// então só quem passa pelo Access consegue ver.

export const IMAGE_MAX = 10 * 1024 * 1024;
export const VIDEO_MAX = 25 * 1024 * 1024;
export const AVATAR_MAX = 2 * 1024 * 1024;

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

export type StoreResult = { ok: true; key: string; video: boolean } | { ok: false; error: string; status: 400 | 413 };

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/** Valida e grava o arquivo no R2. `folder` separa fotos de perfil das mídias dos posts. */
export const storeMedia = async (
  bucket: R2Bucket,
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

  const key = `${folder}/${userId}/${crypto.randomUUID()}.${type.ext}`;
  await bucket.put(key, file, {
    httpMetadata: { contentType: type.contentType },
    customMetadata: { userId: String(userId), name: file.name.slice(0, 200) },
  });
  return { ok: true, key, video: type.video };
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
