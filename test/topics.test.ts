import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { insertUser, postAs, requestAs } from "./helpers";

const ANA = "ana@x.com";
const BETO = "beto@x.com";
const ADMIN = "chefe@x.com";

const createTopic = async (email = ANA, title = "Assunto qualquer", body = "Texto do tópico") => {
  const res = await postAs(email, "/novo", { title, body });
  expect(res.status).toBe(303);
  return Number(res.headers.get("Location")!.split("/").pop());
};

const createReply = async (topicId: number, body: string, email = ANA, parentId?: number) => {
  const fields: Record<string, string> = { body };
  if (parentId) fields.parentId = String(parentId);
  const res = await postAs(email, `/t/${topicId}/respostas`, fields);
  expect(res.status).toBe(303);
  return Number(res.headers.get("Location")!.split("#r-")[1]);
};

const topicRow = (id: number) =>
  env.DB.prepare("SELECT * FROM topics WHERE id = ?").bind(id).first<{
    title: string;
    body_md: string;
    reply_count: number;
    last_reply_by: number | null;
    updated_at: number | null;
    deleted_at: number | null;
  }>();

const page = async (email: string, path: string) => (await requestAs(email, path)).text();

beforeAll(async () => {
  await insertUser(1, ANA, "ana", "Ana");
  await insertUser(2, BETO, "beto", "Beto");
  await insertUser(3, ADMIN, "chefe", "Chefe");
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = 3").run();
});

describe("tópicos", () => {
  it("cria um tópico e mostra no índice e na página dele", async () => {
    const id = await createTopic(ANA, "Viagem de fim de ano", "Bora pra **praia**?");
    const html = await page(BETO, `/t/${id}`);
    expect(html).toContain("Viagem de fim de ano");
    expect(html).toContain("<strong>praia</strong>");
    expect(await page(BETO, "/")).toContain(`href="/t/${id}"`);
  });

  it("manda o editor como textarea com Markdown e barra de botões (o editor visual vem do JS)", async () => {
    const html = await page(ANA, "/novo");
    expect(html).toContain('<textarea name="body" class="editor-input"');
    expect(html).toContain('data-editor-action="bold"');
    expect(html).toContain('data-editor-action="orderedList"');
    expect(html).toContain("data-editor-upload");
    expect(html).not.toContain("Visualizar");
  });

  it("valida título e texto", async () => {
    const res = await postAs(ANA, "/novo", { title: "oi", body: "   " });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("O título deve ter de 3 a 120 caracteres");
    expect(html).toContain("Escreva alguma coisa");
  });

  it("não deixa HTML do usuário virar tag", async () => {
    const id = await createTopic(ANA, "Teste <b>", '<script>alert("x")</script> [link](javascript:alert(1))');
    const html = await page(ANA, `/t/${id}`);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("Teste &lt;b&gt;");
  });

  it("só o autor edita", async () => {
    const id = await createTopic();
    expect((await requestAs(BETO, `/t/${id}/editar`)).status).toBe(403);
    expect((await postAs(BETO, `/t/${id}/editar`, { title: "Hackeado", body: "x" })).status).toBe(403);
    expect((await postAs(ADMIN, `/t/${id}/editar`, { title: "Admin", body: "x" })).status).toBe(403);

    const res = await postAs(ANA, `/t/${id}/editar`, { title: "Título novo", body: "Texto novo" });
    expect(res.status).toBe(303);
    expect(await topicRow(id)).toMatchObject({ title: "Título novo", body_md: "Texto novo" });
    expect((await topicRow(id))?.updated_at).not.toBeNull();
    expect(await page(ANA, `/t/${id}`)).toContain("editado");
  });

  it("autor ou admin apagam; tópico apagado some", async () => {
    const id = await createTopic(ANA, "Vai sumir");
    expect((await postAs(BETO, `/t/${id}/apagar`, {})).status).toBe(403);
    expect((await postAs(ADMIN, `/t/${id}/apagar`, {})).status).toBe(303);

    expect((await requestAs(ANA, `/t/${id}`)).status).toBe(404);
    expect(await page(ANA, "/")).not.toContain("Vai sumir");
    expect((await postAs(ANA, `/t/${id}/respostas`, { body: "oi" })).status).toBe(404);
  });

  it("404 para tópico que não existe", async () => {
    expect((await requestAs(ANA, "/t/999999")).status).toBe(404);
  });
});

describe("respostas", () => {
  it("responde o tópico e atualiza contador e última atividade", async () => {
    const id = await createTopic(ANA);
    const replyId = await createReply(id, "Primeira!", BETO);

    expect(await topicRow(id)).toMatchObject({ reply_count: 1, last_reply_by: 2 });
    const html = await page(ANA, `/t/${id}`);
    expect(html).toContain(`id="r-${replyId}"`);
    expect(html).toContain("Primeira!");
    expect(html).toContain("1 resposta");
    expect(await page(ANA, "/")).toContain("por Beto");
  });

  it("monta a árvore: resposta de resposta fica aninhada embaixo da mãe", async () => {
    const id = await createTopic();
    const a = await createReply(id, "Raiz A");
    const a1 = await createReply(id, "Filha A1", BETO, a);
    await createReply(id, "Neta A1a", ANA, a1);
    await createReply(id, "Raiz B");

    const html = await page(ANA, `/t/${id}`);
    const order = ["Raiz A", "Filha A1", "Neta A1a", "Raiz B"].map((t) => html.indexOf(t));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(order.every((i) => i > 0)).toBe(true);
    // A filha está dentro de uma lista aninhada que fica dentro da raiz A.
    const rootA = html.slice(html.indexOf(`id="r-${a}"`), html.indexOf("Raiz B"));
    expect(rootA).toContain('class="replies nested"');
    expect(rootA).toContain(`id="r-${a1}"`);
  });

  it("cliques repetidos em Responder não duplicam a resposta", async () => {
    const id = await createTopic();
    const first = await createReply(id, "Só uma vez", BETO);
    const again = await createReply(id, "Só uma vez", BETO);
    const both = await Promise.all([createReply(id, "Só uma vez", BETO), createReply(id, "Só uma vez", BETO)]);

    expect(again).toBe(first);
    expect(both).toEqual([first, first]);
    expect((await topicRow(id))?.reply_count).toBe(1);

    // Mesmo texto em outro lugar, ou de outra pessoa, é outra resposta.
    expect(await createReply(id, "Só uma vez", BETO, first)).not.toBe(first);
    expect(await createReply(id, "Só uma vez", ANA)).not.toBe(first);
    expect((await topicRow(id))?.reply_count).toBe(3);
  });

  it("recusa responder a uma resposta de outro tópico", async () => {
    const t1 = await createTopic();
    const t2 = await createTopic();
    const r1 = await createReply(t1, "No tópico 1");
    const res = await postAs(ANA, `/t/${t2}/respostas`, { body: "oi", parentId: String(r1) });
    expect(res.status).toBe(404);
  });

  it("resposta vazia volta com erro e mantém o contexto", async () => {
    const id = await createTopic();
    const res = await postAs(ANA, `/t/${id}/respostas`, { body: "  " });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Escreva alguma coisa");
    expect((await topicRow(id))?.reply_count).toBe(0);
  });

  it("htmx recebe só o formulário; sem htmx vem a página inteira", async () => {
    const id = await createTopic();
    const r = await createReply(id, "Responde aqui");

    const fragment = await (
      await requestAs(ANA, `/t/${id}/responder?para=${r}`, { headers: { "HX-Request": "true" } })
    ).text();
    expect(fragment).not.toContain("<html");
    expect(fragment).toContain(`name="parentId" value="${r}"`);
    expect(fragment).toContain("data-cancel-reply");

    const full = await page(ANA, `/t/${id}/responder?para=${r}`);
    expect(full).toContain("<html");
    expect(full).toContain("Respondendo a Ana");
  });

  it("edição: só o autor", async () => {
    const id = await createTopic();
    const r = await createReply(id, "Original", BETO);
    expect((await postAs(ANA, `/r/${r}/editar`, { body: "Mudei" })).status).toBe(403);
    expect((await postAs(BETO, `/r/${r}/editar`, { body: "Corrigido" })).status).toBe(303);
    expect(await page(ANA, `/t/${id}`)).toContain("Corrigido");
  });

  it("apagar: some se não tem filhas, vira 'removida' se tem", async () => {
    const id = await createTopic();
    const lonely = await createReply(id, "Sozinha", BETO);
    const parent = await createReply(id, "Mãe", BETO);
    await createReply(id, "Filha", ANA, parent);

    expect((await postAs(ANA, `/r/${lonely}/apagar`, {})).status).toBe(403);
    expect((await postAs(BETO, `/r/${lonely}/apagar`, {})).status).toBe(303);
    expect((await postAs(ADMIN, `/r/${parent}/apagar`, {})).status).toBe(303);

    const html = await page(ANA, `/t/${id}`);
    expect(html).not.toContain("Sozinha");
    expect(html).not.toContain("Mãe");
    expect(html).toContain("mensagem removida");
    expect(html).toContain("Filha");
    expect((await topicRow(id))?.reply_count).toBe(1);

    // Não dá para apagar duas vezes nem responder a uma resposta apagada.
    expect((await postAs(BETO, `/r/${lonely}/apagar`, {})).status).toBe(404);
    expect((await topicRow(id))?.reply_count).toBe(1);
    expect((await postAs(ANA, `/t/${id}/respostas`, { body: "oi", parentId: String(parent) })).status).toBe(404);
  });
});

describe("prévia", () => {
  it("renderiza Markdown sanitizado", async () => {
    const res = await postAs(ANA, "/preview", { body: "**oi** <img src=x onerror=alert(1)>" });
    const html = await res.text();
    expect(html).toContain("<strong>oi</strong>");
    expect(html).not.toContain("<img");
  });

  it("exige login de membro", async () => {
    const res = await postAs("estranho@x.com", "/preview", { body: "oi" });
    expect(res.status).toBe(403);
  });
});
