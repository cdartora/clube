import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const get = (path: string) => exports.default.fetch(`http://clube.test${path}`);

describe("índice", () => {
  it("mostra a mensagem de vazio quando não há tópicos", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Nenhum tópico ainda");
  });

  it("lista tópicos com o nome do autor", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, email, username, display_name, role) VALUES (1, 'a@x.com', 'ana', 'Ana', 'admin')",
      ),
      env.DB.prepare(
        "INSERT INTO topics (author_id, title, body_md) VALUES (1, 'Churrasco no sábado?', 'Quem topa?')",
      ),
    ]);

    const html = await (await get("/")).text();
    expect(html).toContain("Churrasco no sábado?");
    expect(html).toContain("por Ana");
  });

  it("responde 404 com o layout do fórum", async () => {
    const res = await get("/nao-existe");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Página não encontrada");
  });
});
