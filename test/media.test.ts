import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DAILY_UPLOADS, sniffMediaType, USER_BUDGET } from "../src/lib/media";
import { insertUser, requestAs } from "./helpers";

const ANA = "ana@x.com";
const BETO = "beto@x.com";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), 0, 0, 2, 0, 9, 9, 9, 9]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const multipart = (
  email: string,
  path: string,
  fields: Record<string, string | File>,
  extraEnv: Partial<Env> = {},
) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return requestAs(email, path, { method: "POST", headers: { Origin: "http://localhost" }, body }, extraEnv);
};

const upload = (file: File, email = ANA, extraEnv: Partial<Env> = {}) =>
  multipart(email, "/midia", { file }, extraEnv);

const mediaRow = (key: string) =>
  env.DB.prepare("SELECT user_id, size FROM media WHERE key = ?").bind(key).first<{ user_id: number; size: number }>();

beforeAll(async () => {
  await insertUser(1, ANA, "ana", "Ana");
  await insertUser(2, BETO, "beto", "Beto");
});

describe("sniffMediaType", () => {
  it("reconhece pelo conteúdo, não pelo nome", () => {
    expect(sniffMediaType(PNG)?.ext).toBe("png");
    expect(sniffMediaType(JPEG)?.ext).toBe("jpg");
    expect(sniffMediaType(MP4)).toMatchObject({ ext: "mp4", video: true });
    expect(sniffMediaType(SVG)).toBeNull();
  });
});

describe("upload de mídia", () => {
  it("guarda a foto no R2 e devolve o Markdown", async () => {
    const res = await upload(new File([PNG], "Praia [2026].png", { type: "image/png" }));
    expect(res.status).toBe(201);
    const data = await res.json<{ url: string; markdown: string; video: boolean }>();
    expect(data.url).toMatch(/^\/m\/posts\/1\/[0-9a-f-]{36}\.png$/);
    expect(data.markdown).toBe(`![Praia 2026](${data.url})`);
    expect(data.video).toBe(false);

    const object = await env.MEDIA.get(data.url.slice(3));
    expect(object?.httpMetadata?.contentType).toBe("image/png");
    expect(object?.customMetadata?.userId).toBe("1");
    expect(await mediaRow(data.url.slice(3))).toEqual({ user_id: 1, size: PNG.length });
  });

  it("recusa o que não é foto nem vídeo, mesmo com nome e tipo de imagem", async () => {
    const res = await upload(new File([SVG], "foto.png", { type: "image/png" }));
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toContain("Formato não aceito");
  });

  it("recusa arquivo grande demais", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(JPEG);
    const res = await upload(new File([big], "grande.jpg"));
    expect(res.status).toBe(413);
  });

  it("recusa pedido sem arquivo", async () => {
    const res = await multipart(ANA, "/midia", { file: "texto" });
    expect(res.status).toBe(400);
  });

  it("recusa upload vindo de outro site", async () => {
    const body = new FormData();
    body.append("file", new File([PNG], "x.png"));
    const res = await requestAs(ANA, "/midia", { method: "POST", headers: { Origin: "https://mal.example" }, body });
    expect(res.status).toBe(403);
  });
});

describe("limites de espaço", () => {
  // Caio só aparece aqui; os registros falsos são apagados depois de cada teste.
  const CAIO = "caio@x.com";
  beforeAll(() => insertUser(3, CAIO, "caio", "Caio"));
  afterEach(() => env.DB.prepare("DELETE FROM media WHERE key LIKE 'fake/%'").run());

  const fakeRows = (n: number, size: number, createdAt = Math.floor(Date.now() / 1000)) =>
    env.DB.batch(
      Array.from({ length: n }, (_, i) =>
        env.DB.prepare("INSERT INTO media (key, user_id, size, created_at) VALUES (?, 3, ?, ?)").bind(
          `fake/${i}`,
          size,
          createdAt,
        ),
      ),
    );

  it("recusa quando o bucket chegaria ao limite do Clube", async () => {
    const res = await upload(new File([PNG], "a.png"), CAIO, { MEDIA_BUDGET_MB: "0.00001" });
    expect(res.status).toBe(507);
    expect((await res.json<{ error: string }>()).error).toContain("espaço de fotos e vídeos do Clube acabou");
  });

  it("recusa quando a pessoa já usou a cota dela", async () => {
    await fakeRows(1, USER_BUDGET);
    const res = await upload(new File([PNG], "a.png"), CAIO);
    expect(res.status).toBe(413);
    // A cota é de cada um: Ana continua enviando.
    expect((await upload(new File([PNG], "a.png"), ANA)).status).toBe(201);
  });

  it("limita os envios por dia, mas não conta os de antes", async () => {
    await fakeRows(DAILY_UPLOADS, 1, Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60);
    expect((await upload(new File([PNG], "a.png"), CAIO)).status).toBe(201);

    await env.DB.prepare("UPDATE media SET created_at = unixepoch() WHERE key LIKE 'fake/%'").run();
    const res = await upload(new File([PNG], "a.png"), CAIO);
    expect(res.status).toBe(429);
  });
});

describe("servindo mídia", () => {
  it("serve o arquivo com tipo, cache e cabeçalhos de segurança", async () => {
    const { url } = await (await upload(new File([PNG], "a.png"))).json<{ url: string }>();
    const res = await requestAs(BETO, url);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);

    const again = await requestAs(BETO, url, { headers: { "If-None-Match": res.headers.get("ETag")! } });
    expect(again.status).toBe(304);
  });

  it("responde pedidos de intervalo (vídeo)", async () => {
    const { url } = await (await upload(new File([MP4], "v.mp4"))).json<{ url: string }>();
    const res = await requestAs(BETO, url, { headers: { Range: "bytes=4-11" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 4-11/${MP4.length}`);
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe("ftypisom");
  });

  it("não serve chaves fora do formato nem sem login", async () => {
    expect((await requestAs(BETO, "/m/posts/1/../../segredo.png")).status).toBe(404);
    expect((await requestAs(BETO, `/m/posts/1/${crypto.randomUUID()}.png`)).status).toBe(404);
    expect((await requestAs(undefined, `/m/posts/1/${crypto.randomUUID()}.png`)).status).toBe(500);
  });

  it("mostra vídeos enviados como <video> e imagens com carregamento sob demanda", async () => {
    const video = await (await upload(new File([MP4], "v.mp4"))).json<{ markdown: string; url: string }>();
    const photo = await (await upload(new File([PNG], "p.png"))).json<{ markdown: string; url: string }>();
    const res = await requestAs(ANA, "/preview", {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: new URLSearchParams({ body: `${video.markdown}\n\n${photo.markdown}\n\n![x](https://fora.example/v.mp4)` }),
    });
    const html = await res.text();
    expect(html).toContain(`<video src="${video.url}" controls`);
    expect(html).toContain(`<img src="${photo.url}" alt="p" loading="lazy">`);
    expect(html).toContain('<img src="https://fora.example/v.mp4"');
  });
});

describe("foto de perfil", () => {
  const avatarKey = async () =>
    (await env.DB.prepare("SELECT avatar_key FROM users WHERE id = 2").first<{ avatar_key: string | null }>())!.avatar_key;

  it("envia, troca (apagando a antiga) e tira a foto", async () => {
    let res = await multipart(BETO, "/perfil", { displayName: "Beto", bio: "", avatar: new File([JPEG], "eu.jpg") });
    expect(res.status).toBe(303);
    const first = await avatarKey();
    expect(first).toMatch(/^avatars\/2\/.+\.jpg$/);
    expect(await (await requestAs(ANA, "/u/beto")).text()).toContain(`src="/m/${first}"`);

    res = await multipart(BETO, "/perfil", { displayName: "Beto", bio: "", avatar: new File([PNG], "eu.png") });
    expect(res.status).toBe(303);
    const second = await avatarKey();
    expect(second).toMatch(/\.png$/);
    expect(await env.MEDIA.head(first!)).toBeNull();
    expect(await mediaRow(first!)).toBeNull();

    // Salvar sem escolher arquivo mantém a foto.
    res = await multipart(BETO, "/perfil", { displayName: "Beto B.", bio: "", avatar: new File([], "") });
    expect(res.status).toBe(303);
    expect(await avatarKey()).toBe(second);

    res = await multipart(BETO, "/perfil", { displayName: "Beto", bio: "", removeAvatar: "1" });
    expect(res.status).toBe(303);
    expect(await avatarKey()).toBeNull();
    expect(await env.MEDIA.head(second!)).toBeNull();
  });

  it("aceita só imagem pequena", async () => {
    let res = await multipart(BETO, "/perfil", { displayName: "Beto", bio: "", avatar: new File([MP4], "v.mp4") });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("JPEG, PNG, GIF ou WebP");

    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    res = await multipart(BETO, "/perfil", { displayName: "Beto", bio: "", avatar: new File([big], "g.png") });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("limite é 2 MB");
  });
});

describe("perfil com mídia nas respostas", () => {
  it("o trecho da resposta não mostra o Markdown da imagem", async () => {
    const id = Number(
      (await requestAs(ANA, "/novo", {
        method: "POST",
        headers: { Origin: "http://localhost" },
        body: new URLSearchParams({ title: "Fotos da viagem", body: "Olha" }),
      })).headers.get("Location")!.split("/").pop(),
    );
    await requestAs(ANA, `/t/${id}/respostas`, {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: new URLSearchParams({ body: "Que dia! ![praia](/m/posts/1/00000000-0000-0000-0000-000000000000.jpg)" }),
    });
    const html = await (await requestAs(BETO, "/u/ana")).text();
    expect(html).toContain("Que dia! (mídia)");
    expect(html).not.toContain("/m/posts/1/0000");
  });
});
