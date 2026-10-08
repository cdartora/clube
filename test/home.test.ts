import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { insertUser, requestAs } from "./helpers";

const get = (path: string) => requestAs("ana@x.com", path);

beforeAll(async () => {
  await insertUser(1, "ana@x.com", "ana", "Ana");
});

describe("índice", () => {
  it("mostra a mensagem de vazio quando não há tópicos", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Nenhum tópico ainda");
  });

  it("lista tópicos com o nome do autor", async () => {
    await env.DB.prepare(
      "INSERT INTO topics (author_id, title, body_md) VALUES (1, 'Churrasco no sábado?', 'Quem topa?')",
    ).run();

    const html = await (await get("/")).text();
    expect(html).toContain("Churrasco no sábado?");
    expect(html).toContain('por <a href="/u/ana">Ana</a>');
  });

  it("responde 404 com o layout do fórum", async () => {
    const res = await get("/nao-existe");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Página não encontrada");
  });
});
