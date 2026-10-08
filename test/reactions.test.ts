import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { insertUser, postAs, requestAs } from "./helpers";

const ANA = "ana@x.com";
const BETO = "beto@x.com";
const CAIO = "caio@x.com";

const createTopic = async (email = ANA) => {
  const res = await postAs(email, "/novo", { title: "Assunto", body: "Texto" });
  return Number(res.headers.get("Location")!.split("/").pop());
};

const createReply = async (topicId: number, body: string, email = ANA) => {
  const res = await postAs(email, `/t/${topicId}/respostas`, { body });
  return Number(res.headers.get("Location")!.split("#r-")[1]);
};

const vote = (email: string, targetType: string, targetId: number, value: number, htmx = false) =>
  postAs(
    email,
    "/votar",
    { targetType, targetId: String(targetId), value: String(value) },
    htmx ? { "HX-Request": "true" } : {},
  );

const clap = (email: string, targetType: string, targetId: number, count: number, htmx = false) =>
  postAs(
    email,
    "/aplaudir",
    { targetType, targetId: String(targetId), count: String(count) },
    htmx ? { "HX-Request": "true" } : {},
  );

const totals = (table: "topics" | "replies", id: number) =>
  env.DB.prepare(`SELECT score, clap_count FROM ${table} WHERE id = ?`).bind(id).first<{
    score: number;
    clap_count: number;
  }>();

beforeAll(async () => {
  await insertUser(1, ANA, "ana", "Ana");
  await insertUser(2, BETO, "beto", "Beto");
  await insertUser(3, CAIO, "caio", "Caio");
});

describe("votos", () => {
  it("vota, desfaz votando igual e troca votando ao contrário", async () => {
    const id = await createTopic(ANA);

    expect((await vote(BETO, "topic", id, 1)).status).toBe(303);
    expect((await totals("topics", id))?.score).toBe(1);

    await vote(BETO, "topic", id, 1);
    expect((await totals("topics", id))?.score).toBe(0);

    await vote(BETO, "topic", id, 1);
    await vote(BETO, "topic", id, -1);
    expect((await totals("topics", id))?.score).toBe(-1);

    await vote(CAIO, "topic", id, -1);
    expect((await totals("topics", id))?.score).toBe(-2);
  });

  it("não deixa votar no próprio post", async () => {
    const id = await createTopic(ANA);
    expect((await vote(ANA, "topic", id, 1)).status).toBe(403);
    expect((await totals("topics", id))?.score).toBe(0);
  });

  it("recusa voto inválido ou em post que não existe", async () => {
    const id = await createTopic(ANA);
    expect((await vote(BETO, "topic", id, 2)).status).toBe(400);
    expect((await vote(BETO, "usuario", id, 1)).status).toBe(400);
    expect((await vote(BETO, "topic", 999999, 1)).status).toBe(404);
  });

  it("vale para respostas, e a mais votada sobe na árvore", async () => {
    const id = await createTopic(ANA);
    const first = await createReply(id, "Resposta antiga", ANA);
    const second = await createReply(id, "Resposta boa", ANA);

    let html = await (await requestAs(BETO, `/t/${id}`)).text();
    expect(html.indexOf("Resposta antiga")).toBeLessThan(html.indexOf("Resposta boa"));

    await vote(BETO, "reply", second, 1);
    expect((await totals("replies", second))?.score).toBe(1);
    expect((await totals("replies", first))?.score).toBe(0);

    html = await (await requestAs(BETO, `/t/${id}`)).text();
    expect(html.indexOf("Resposta boa")).toBeLessThan(html.indexOf("Resposta antiga"));
  });

  it("htmx recebe o bloco atualizado com o meu voto marcado", async () => {
    const id = await createTopic(ANA);
    const res = await vote(BETO, "topic", id, 1, true);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("<html");
    expect(html).toContain('class="vote-up voted"');
    expect(html).toContain('<span class="score positive">1</span>');
  });

  it("o voto é anônimo: ninguém vê quem votou", async () => {
    const id = await createTopic(ANA);
    await vote(BETO, "topic", id, -1);
    const html = await (await requestAs(ANA, `/t/${id}`)).text();
    expect(html).toContain('<span class="score negative">-1</span>');
    expect(html).not.toContain("vote-down voted");
  });
});

describe("aplausos", () => {
  it("acumula aplausos e trava em 10 por pessoa", async () => {
    const id = await createTopic(ANA);
    await clap(BETO, "topic", id, 4);
    await clap(BETO, "topic", id, 3);
    expect((await totals("topics", id))?.clap_count).toBe(7);

    await clap(BETO, "topic", id, 9);
    expect((await totals("topics", id))?.clap_count).toBe(10);

    await clap(CAIO, "topic", id, 2);
    expect((await totals("topics", id))?.clap_count).toBe(12);
  });

  it("recusa quantidade inválida e aplauso no próprio post", async () => {
    const id = await createTopic(ANA);
    for (const n of [0, 11, 1.5]) {
      expect((await clap(BETO, "topic", id, n)).status).toBe(400);
    }
    expect((await clap(ANA, "topic", id, 1)).status).toBe(403);
    expect((await totals("topics", id))?.clap_count).toBe(0);
  });

  it("mostra publicamente quem aplaudiu e quanto", async () => {
    const id = await createTopic(ANA);
    const r = await createReply(id, "Mandou bem", ANA);
    await clap(BETO, "reply", r, 5);
    await clap(CAIO, "reply", r, 1);

    const html = await (await requestAs(ANA, `/t/${id}`)).text();
    expect(html).toContain('<summary class="clap-count">6</summary>');
    expect(html).toContain("Beto 5×, Caio");

    const asBeto = await (await requestAs(BETO, `/t/${id}`)).text();
    expect(asBeto).toContain("Você 5×, Caio");
  });

  it("htmx recebe o bloco com quantos aplausos ainda dá para dar", async () => {
    const id = await createTopic(ANA);
    const html = await (await clap(BETO, "topic", id, 3, true)).text();
    expect(html).toContain('data-claps-left="7"');
    expect(html).toContain('class="clap-button clapped"');
  });

  it("não aceita aplauso em resposta apagada", async () => {
    const id = await createTopic(ANA);
    const r = await createReply(id, "Vou apagar", ANA);
    await postAs(ANA, `/r/${r}/apagar`, {});
    expect((await clap(BETO, "reply", r, 1)).status).toBe(404);
  });
});
