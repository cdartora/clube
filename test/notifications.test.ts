import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { insertUser, postAs, requestAs } from "./helpers";

const ANA = "ana@x.com";
const BETO = "beto@x.com";
const CAIO = "caio@x.com";

const createTopic = async (email: string, title: string) => {
  const res = await postAs(email, "/novo", { title, body: "Texto" });
  return Number(res.headers.get("Location")!.split("/").pop());
};

const reply = async (email: string, topicId: number, body: string, parentId?: number) => {
  const fields: Record<string, string> = { body };
  if (parentId) fields.parentId = String(parentId);
  const res = await postAs(email, `/t/${topicId}/respostas`, fields);
  return Number(res.headers.get("Location")!.split("#r-")[1]);
};

const clap = (email: string, targetType: string, targetId: number, count = 1) =>
  postAs(email, "/aplaudir", { targetType, targetId: String(targetId), count: String(count) });

const page = async (email: string, path: string) => (await requestAs(email, path)).text();

const unreadBadge = async (email: string) => {
  const m = (await page(email, "/regras")).match(/Notificações<span class="badge">(\d+)<\/span>/);
  return m ? Number(m[1]) : 0;
};

/** Leituras são guardadas em segundos: recua a última visita para simular o tempo passando. */
const rewindReads = (email: string) =>
  env.DB.prepare(
    "UPDATE topic_reads SET last_read_at = last_read_at - 60 WHERE user_id = (SELECT id FROM users WHERE email = ?)",
  )
    .bind(email)
    .run();

beforeAll(async () => {
  await insertUser(1, ANA, "ana", "Ana");
  await insertUser(2, BETO, "beto", "Beto");
  await insertUser(3, CAIO, "caio", "Caio");
});

describe("notificações", () => {
  it("avisa o autor do tópico quando alguém responde", async () => {
    const t = await createTopic(ANA, "Tópico da Ana");
    const before = await unreadBadge(ANA);
    await reply(BETO, t, "Opa");

    expect(await unreadBadge(ANA)).toBe(before + 1);
    const html = await page(ANA, "/notificacoes");
    expect(html).toContain("<strong>Beto</strong> respondeu seu tópico");
    expect(html).toContain("Tópico da Ana");
  });

  it("resposta de resposta avisa o autor da resposta-mãe, não o do tópico", async () => {
    const t = await createTopic(ANA, "Conversa a três");
    const r = await reply(BETO, t, "Primeira");
    await page(ANA, `/t/${t}`); // Ana lê o aviso da resposta do Beto
    const anaBefore = await unreadBadge(ANA);

    await reply(CAIO, t, "Concordo com o Beto", r);
    expect(await unreadBadge(ANA)).toBe(anaBefore);
    expect(await page(BETO, "/notificacoes")).toContain("<strong>Caio</strong> respondeu sua resposta em");
  });

  it("não avisa a pessoa sobre a própria resposta", async () => {
    const t = await createTopic(CAIO, "Monólogo");
    await page(CAIO, `/t/${t}`);
    const before = await unreadBadge(CAIO);
    await reply(CAIO, t, "Falando sozinho");
    expect(await unreadBadge(CAIO)).toBe(before);
  });

  it("aplausos no mesmo post viram um aviso só", async () => {
    const t = await createTopic(ANA, "Merece aplauso");
    await page(ANA, "/notificacoes");
    await postAs(ANA, "/notificacoes/lidas", {});

    await clap(BETO, "topic", t, 3);
    await clap(CAIO, "topic", t, 1);
    await clap(BETO, "topic", t, 1);

    expect(await unreadBadge(ANA)).toBe(1);
    expect(await page(ANA, "/notificacoes")).toContain("<strong>Beto e mais 1 pessoa</strong> aplaudiram seu tópico");
  });

  it("abrir o tópico marca os avisos dele como lidos; o botão marca todos", async () => {
    const t1 = await createTopic(BETO, "Tópico um");
    const t2 = await createTopic(BETO, "Tópico dois");
    await postAs(BETO, "/notificacoes/lidas", {});
    await reply(ANA, t1, "a");
    await reply(ANA, t2, "b");
    expect(await unreadBadge(BETO)).toBe(2);

    await page(BETO, `/t/${t1}`);
    expect(await unreadBadge(BETO)).toBe(1);

    expect((await postAs(BETO, "/notificacoes/lidas", {})).status).toBe(303);
    expect(await unreadBadge(BETO)).toBe(0);
  });

  it("some o aviso de tópico apagado", async () => {
    const t = await createTopic(CAIO, "Vai sumir");
    await postAs(CAIO, "/notificacoes/lidas", {});
    await reply(ANA, t, "oi");
    expect(await unreadBadge(CAIO)).toBe(1);
    await postAs(CAIO, `/t/${t}/apagar`, {});
    expect(await unreadBadge(CAIO)).toBe(0);
    expect(await page(CAIO, "/notificacoes")).not.toContain("Vai sumir");
  });
});

describe("marcador de novo", () => {
  const rowFor = (html: string, title: string) => {
    const end = html.indexOf(title);
    return html.slice(html.lastIndexOf("<tr", end), html.indexOf("</tr>", end));
  };

  it("tópico nunca aberto é novo; depois de aberto, não", async () => {
    const t = await createTopic(ANA, "Novidade quente");
    expect(rowFor(await page(BETO, "/"), "Novidade quente")).toContain(">novo<");
    await page(BETO, `/t/${t}`);
    expect(rowFor(await page(BETO, "/"), "Novidade quente")).not.toContain("badge-new");
  });

  it("resposta de outra pessoa marca 'novas respostas' e destaca a resposta nova", async () => {
    const t = await createTopic(ANA, "Acompanhando");
    const old = await reply(ANA, t, "Resposta antiga");
    await env.DB.prepare("UPDATE replies SET created_at = created_at - 120 WHERE id = ?").bind(old).run();
    await page(BETO, `/t/${t}`);
    await rewindReads(BETO);

    const fresh = await reply(CAIO, t, "Resposta fresquinha");
    expect(rowFor(await page(BETO, "/"), "Acompanhando")).toContain("novas respostas");

    const html = await page(BETO, `/t/${t}`);
    const freshBlock = html.slice(html.indexOf(`id="r-${fresh}"`), html.indexOf("Resposta fresquinha"));
    const oldBlock = html.slice(html.indexOf(`id="r-${old}"`), html.indexOf("Resposta antiga"));
    expect(freshBlock).toContain("is-new");
    expect(oldBlock).not.toContain("is-new");

    // A visita zerou: o tópico não aparece mais como novo.
    expect(rowFor(await page(BETO, "/"), "Acompanhando")).not.toContain("badge-new");
  });

  it("minha própria resposta não deixa o tópico como novo para mim", async () => {
    const t = await createTopic(ANA, "Eu mesmo");
    await page(BETO, `/t/${t}`);
    await reply(BETO, t, "Minha resposta");
    await page(BETO, `/t/${t}`); // o redirect depois de responder leva de volta ao tópico
    expect(rowFor(await page(BETO, "/"), "Eu mesmo")).not.toContain("badge-new");
  });
});
