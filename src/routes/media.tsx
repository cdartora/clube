import { type Context, Hono } from "hono";
import type { AppEnv, Member } from "../auth/middleware";
import { MEDIA_KEY_RE, mediaMarkdown, mediaUrl, storeMedia } from "../lib/media";

const me = (c: Context<AppEnv>) => c.get("user") as Member;

export const mediaRoutes = new Hono<AppEnv>();

// Upload do editor (botão "Foto/vídeo", colar ou arrastar). Responde JSON com o Markdown pronto.
mediaRoutes.post("/midia", async (c) => {
  const form = await c.req.parseBody().catch(() => null);
  const file = form?.file;
  if (!(file instanceof File)) return c.json({ error: "Nenhum arquivo enviado." }, 400);

  const stored = await storeMedia(c.env.MEDIA, file, { userId: me(c).id, folder: "posts" });
  if (!stored.ok) return c.json({ error: stored.error }, stored.status);

  return c.json(
    { url: mediaUrl(stored.key), markdown: mediaMarkdown(stored.key, file.name), video: stored.video },
    201,
  );
});

// O R2 devolve o intervalo como foi pedido ("os últimos N bytes", "do byte X em diante"...).
const resolveRange = (range: R2Range | undefined, size: number) => {
  if (!range) return null;
  if ("suffix" in range && range.suffix !== undefined) {
    return { start: Math.max(size - range.suffix, 0), end: size - 1 };
  }
  const start = "offset" in range && range.offset !== undefined ? range.offset : 0;
  const length = "length" in range && range.length !== undefined ? range.length : size - start;
  return { start, end: Math.min(start + length, size) - 1 };
};

mediaRoutes.get("/m/:key{.+}", async (c) => {
  const key = c.req.param("key");
  if (!MEDIA_KEY_RE.test(key)) return c.notFound();

  // Range (vídeo no Safari exige) e If-None-Match são repassados ao R2.
  const headers = c.req.raw.headers;
  const object = await c.env.MEDIA.get(key, { range: headers, onlyIf: headers });
  if (!object) return c.notFound();

  const res = new Headers();
  object.writeHttpMetadata(res);
  res.set("ETag", object.httpEtag);
  res.set("Accept-Ranges", "bytes");
  // A chave tem um UUID novo a cada envio: o conteúdo de um endereço nunca muda.
  res.set("Cache-Control", "private, max-age=31536000, immutable");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Security-Policy", "default-src 'none'; sandbox");

  if (!("body" in object)) return new Response(null, { status: 304, headers: res });

  const range = headers.has("Range") ? resolveRange(object.range, object.size) : null;
  if (range) {
    res.set("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
    res.set("Content-Length", String(range.end - range.start + 1));
    return new Response(object.body, { status: 206, headers: res });
  }
  return new Response(object.body, { headers: res });
});
