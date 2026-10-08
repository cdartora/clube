import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accessApiEnv, fakeAccessApi } from "./fake-access";
import { insertUser, postAs, requestAs } from "./helpers";

const ANA = "ana@x.com"; // admin
const BETO = "beto@x.com"; // convidado pela Ana
const CAIO = "caio@x.com";
const DANI = "dani@x.com"; // outra admin

const page = async (email: string, path: string) => (await requestAs(email, path)).text();
const statusOf = async (id: number) =>
  (await env.DB.prepare("SELECT status FROM users WHERE id = ?").bind(id).first<{ status: string }>())?.status;

beforeAll(async () => {
  await insertUser(1, ANA, "ana", "Ana");
  await insertUser(2, BETO, "beto", "Beto");
  await insertUser(3, CAIO, "caio", "Caio");
  await insertUser(4, DANI, "dani", "Dani");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET role = 'admin' WHERE id IN (1, 4)"),
    env.DB.prepare("UPDATE users SET invited_by = 1, bio = 'Gosto de churrasco.' WHERE id = 2"),
  ]);
});

describe("perfil", () => {
  it("mostra dados, quem convidou, estatísticas e atividade", async () => {
    const res = await postAs(BETO, "/novo", { title: "Tópico do Beto", body: "Oi" });
    const topicId = Number(res.headers.get("Location")!.split("/").pop());
    await postAs(BETO, `/t/${topicId}/respostas`, { body: "Respondendo **a mim mesmo**" });
    await postAs(CAIO, "/aplaudir", { targetType: "topic", targetId: String(topicId), count: "3" });

    const html = await page(CAIO, "/u/beto");
    expect(html).toContain("Beto");
    expect(html).toContain("Gosto de churrasco.");
    expect(html).toContain('convidado por <a href="/u/ana" class="user-link">Ana</a>');
    expect(html).toContain("<strong>1</strong> tópicos");
    expect(html).toContain("<strong>1</strong> respostas");
    expect(html).toContain("<strong>3</strong> aplausos recebidos");
    expect(html).toContain("Tópico do Beto");
    expect(html).toContain("Respondendo a mim mesmo");
    expect(html).not.toContain("Editar perfil");

    expect(await page(ANA, "/u/ana")).toContain("Trouxe para o Clube");
  });

  it("404 para apelido que não existe", async () => {
    expect((await requestAs(ANA, "/u/ninguem")).status).toBe(404);
  });

  it("edita nome e bio do próprio perfil", async () => {
    expect(await page(CAIO, "/u/caio")).toContain("Editar perfil");
    const res = await postAs(CAIO, "/perfil", { displayName: "Caio Silva", bio: "Fotógrafo amador.\nCorredor." });
    expect(res.status).toBe(303);
    const html = await page(ANA, "/u/caio");
    expect(html).toContain("Caio Silva");
    expect(html).toContain("Fotógrafo amador.\nCorredor.");
  });

  it("valida nome vazio e bio longa", async () => {
    const res = await postAs(CAIO, "/perfil", { displayName: " ", bio: "x".repeat(501) });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Conte como você quer ser chamado");
    expect(html).toContain("no máximo 500");
  });

  it("nomes nos posts e no índice levam ao perfil", async () => {
    expect(await page(ANA, "/")).toContain('por <a href="/u/beto">Beto</a>');
  });
});

describe("admin", () => {
  let access: ReturnType<typeof fakeAccessApi>;
  beforeEach(() => {
    access = fakeAccessApi();
    access.state.emails = new Set([ANA, BETO, CAIO, DANI]);
  });
  afterEach(() => access.restore());

  const adminPost = (who: string, path: string, fields: Record<string, string> = {}) =>
    postAs(who, path, fields, {}, accessApiEnv);

  it("só admin vê o painel", async () => {
    expect((await requestAs(BETO, "/admin")).status).toBe(403);
    expect((await postAs(BETO, "/admin/membros/3/desativar", {})).status).toBe(403);
    const html = await page(ANA, "/admin");
    expect(html).toContain("caio@x.com");
    expect(await page(ANA, "/")).toContain('href="/admin"');
    expect(await page(BETO, "/")).not.toContain('href="/admin"');
  });

  it("desativar tira do Access e bloqueia na hora; reativar devolve", async () => {
    expect((await adminPost(ANA, "/admin/membros/3/desativar")).status).toBe(303);
    expect(await statusOf(3)).toBe("disabled");
    expect(access.state.emails.has(CAIO)).toBe(false);
    expect((await requestAs(CAIO, "/")).status).toBe(403);

    expect((await adminPost(ANA, "/admin/membros/3/reativar")).status).toBe(303);
    expect(await statusOf(3)).toBe("active");
    expect(access.state.emails.has(CAIO)).toBe(true);
    expect((await requestAs(CAIO, "/")).status).toBe(200);
  });

  it("não deixa mexer em si mesmo nem em outro admin", async () => {
    expect((await adminPost(ANA, "/admin/membros/1/desativar")).status).toBe(403);
    expect((await adminPost(ANA, "/admin/membros/4/desativar")).status).toBe(403);
    expect(await statusOf(4)).toBe("active");
  });

  it("se o Access falhar, não desativa", async () => {
    access.state.fail = true;
    const res = await adminPost(ANA, "/admin/membros/2/desativar");
    expect(res.status).toBe(502);
    expect(await statusOf(2)).toBe("active");
  });

  it("ajusta a cota de convites", async () => {
    expect((await adminPost(ANA, "/admin/membros/2/cota", { quota: "3" })).status).toBe(303);
    const row = await env.DB.prepare("SELECT invite_quota FROM users WHERE id = 2").first<{ invite_quota: number }>();
    expect(row?.invite_quota).toBe(3);
    expect(await page(BETO, "/convites")).toContain("Você tem 3 convites");

    for (const bad of ["-1", "51", "abc", "1.5"]) {
      expect((await adminPost(ANA, "/admin/membros/2/cota", { quota: bad })).status).toBe(400);
    }
  });
});
