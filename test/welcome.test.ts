import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { insertUser, requestAs } from "./helpers";

const invite = (email: string, invitedBy = 1, status = "pending") =>
  env.DB.prepare("INSERT INTO invites (email, invited_by, status) VALUES (?, ?, ?)")
    .bind(email, invitedBy, status)
    .run();

const postWelcome = (email: string, fields: Record<string, string>, origin = "http://localhost") =>
  requestAs(email, "/boas-vindas", {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams(fields),
  });

const userByEmail = (email: string) =>
  env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<{
    username: string;
    display_name: string;
    invited_by: number;
    role: string;
  }>();

const inviteStatuses = async (email: string) =>
  (
    await env.DB.prepare("SELECT status FROM invites WHERE email = ? ORDER BY id")
      .bind(email)
      .all<{ status: string }>()
  ).results.map((r) => r.status);

beforeAll(async () => {
  await insertUser(1, "ana@x.com", "ana", "Ana");
  await insertUser(2, "beto@x.com", "beto", "Beto");
});

describe("boas-vindas", () => {
  it("manda quem tem convite pendente para as boas-vindas", async () => {
    await invite("caio@x.com");
    const res = await requestAs("caio@x.com", "/");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/boas-vindas");
  });

  it("mostra quem convidou e as regras", async () => {
    await invite("duda@x.com");
    const html = await (await requestAs("duda@x.com", "/boas-vindas")).text();
    expect(html).toContain("<strong>Ana</strong> te convidou");
    expect(html).toContain("Regras da casa");
  });

  it("cria a conta, aceita o convite e libera o fórum", async () => {
    await invite("eva@x.com");
    const res = await postWelcome("eva@x.com", {
      username: "@Eva_99",
      displayName: "  Eva  ",
      acceptRules: "1",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/");

    expect(await userByEmail("eva@x.com")).toMatchObject({
      username: "eva_99",
      display_name: "Eva",
      invited_by: 1,
      role: "member",
    });
    expect(await inviteStatuses("eva@x.com")).toEqual(["accepted"]);
    expect((await requestAs("eva@x.com", "/")).status).toBe(200);
  });

  it("quando vários convidaram, aceita o mais antigo e devolve os outros à cota", async () => {
    await invite("fabi@x.com", 1);
    await invite("fabi@x.com", 2);
    await postWelcome("fabi@x.com", { username: "fabi", displayName: "Fabi", acceptRules: "1" });
    expect((await userByEmail("fabi@x.com"))?.invited_by).toBe(1);
    expect(await inviteStatuses("fabi@x.com")).toEqual(["accepted", "canceled"]);
  });

  it.each([
    [{ username: "a", displayName: "Gui", acceptRules: "1" }, "de 3 a 20 caracteres"],
    [{ username: "gui espaço", displayName: "Gui", acceptRules: "1" }, "de 3 a 20 caracteres"],
    [{ username: "admin", displayName: "Gui", acceptRules: "1" }, "reservado"],
    [{ username: "ana", displayName: "Gui", acceptRules: "1" }, "já está em uso"],
    [{ username: "gui", displayName: "   ", acceptRules: "1" }, "como você quer ser chamado"],
    [{ username: "gui", displayName: "x".repeat(41), acceptRules: "1" }, "no máximo 40"],
    [{ username: "gui", displayName: "Gui" }, "concordar com as regras"],
  ])("recusa dados inválidos: %o", async (fields, message) => {
    await invite("gui@x.com");
    const res = await postWelcome("gui@x.com", fields);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(message);
    expect(await userByEmail("gui@x.com")).toBeNull();
  });

  it("devolve os valores digitados quando há erro", async () => {
    await invite("hugo@x.com");
    const html = await (
      await postWelcome("hugo@x.com", { username: "hugo", displayName: "Hugo Lindo" })
    ).text();
    expect(html).toContain('value="Hugo Lindo"');
  });

  it("barra quem não tem convite pendente", async () => {
    await invite("ivo@x.com", 1, "canceled");
    expect((await requestAs("ivo@x.com", "/")).status).toBe(403);
    expect((await requestAs("ivo@x.com", "/boas-vindas")).status).toBe(403);
    const res = await postWelcome("ivo@x.com", { username: "ivo", displayName: "Ivo", acceptRules: "1" });
    expect(res.status).toBe(403);
    expect(await userByEmail("ivo@x.com")).toBeNull();
  });

  it("manda quem já é membro de volta para o índice", async () => {
    const res = await requestAs("ana@x.com", "/boas-vindas");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("recusa envio de formulário vindo de outro site (CSRF)", async () => {
    await invite("joao@x.com");
    const res = await postWelcome(
      "joao@x.com",
      { username: "joao", displayName: "João", acceptRules: "1" },
      "https://malvado.example",
    );
    expect(res.status).toBe(403);
    expect(await userByEmail("joao@x.com")).toBeNull();
  });
});

describe("regras", () => {
  it("membros veem a página de regras", async () => {
    const res = await requestAs("ana@x.com", "/regras");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("O que se fala aqui, fica aqui");
  });
});
