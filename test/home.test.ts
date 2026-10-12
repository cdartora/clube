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

describe("paginação e marcar tudo como lido", () => {
  const ids = async () =>
    [...(await (await get("/")).text()).matchAll(/href="\/t\/(\d+)" class="topic-title"/g)].map((m) => m[1]);

  it("mostra 30 tópicos por página, com links entre as páginas", async () => {
    await env.DB.prepare("DELETE FROM topics").run();
    await env.DB.batch(
      Array.from({ length: 31 }, (_, i) =>
        env.DB.prepare(
          "INSERT INTO topics (id, author_id, title, body_md, last_activity_at) VALUES (?, 1, ?, 'x', ?)",
        ).bind(i + 1, `Tópico ${i + 1}`, 1_700_000_000 + i),
      ),
    );

    const first = await (await get("/")).text();
    expect(await ids()).toHaveLength(30);
    expect(first).toContain('href="/?pagina=2"');
    expect(first).not.toContain("mais recentes");

    const second = await (await get("/?pagina=2")).text();
    expect(second).toContain('href="/t/1" class="topic-title"');
    expect(second).toContain('<a href="/">← mais recentes</a>');
    expect(second).not.toContain("mais antigos");

    const beyond = await get("/?pagina=9");
    expect(beyond.status).toBe(302);
    expect(beyond.headers.get("Location")).toBe("/");
  });

  it("marca todos os tópicos como lidos, inclusive os das outras páginas", async () => {
    expect(await (await get("/")).text()).toContain("marcar tudo como lido");

    const res = await requestAs("ana@x.com", "/lidos", { method: "POST", headers: { Origin: "http://localhost" } });
    expect(res.status).toBe(303);

    for (const path of ["/", "/?pagina=2"]) {
      const html = await (await get(path)).text();
      expect(html).not.toContain('class="badge-new"');
      expect(html).not.toContain("marcar tudo como lido");
    }
    const reads = await env.DB.prepare("SELECT count(*) AS n FROM topic_reads WHERE user_id = 1").first<{ n: number }>();
    expect(reads?.n).toBe(31);
  });
});
