import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accessApiEnv, fakeAccessApi } from "./fake-access";
import { insertUser, postAs, requestAs } from "./helpers";

const ANA = "ana@x.com"; // membro, cota 1
const BETO = "beto@x.com"; // membro, cota 1
const CHEFE = "chefe@x.com"; // admin

let access: ReturnType<typeof fakeAccessApi>;

const invite = (inviter: string, email: string) => postAs(inviter, "/convites", { email }, {}, accessApiEnv);
const cancel = (who: string, id: number) => postAs(who, `/convites/${id}/cancelar`, {}, {}, accessApiEnv);
const inviteId = (res: Response) => Number(new URL(res.headers.get("Location")!, "http://x").searchParams.get("enviado"));
const statusOf = async (id: number) =>
  (await env.DB.prepare("SELECT status FROM invites WHERE id = ?").bind(id).first<{ status: string }>())?.status;

beforeAll(async () => {
  await insertUser(1, ANA, "ana", "Ana");
  await insertUser(2, BETO, "beto", "Beto");
  await insertUser(3, CHEFE, "chefe", "Chefe");
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = 3").run();
});

beforeEach(() => {
  access = fakeAccessApi();
});

afterEach(() => access.restore());

describe("convites", () => {
  it("convida, libera no Access e mostra o link para mandar", async () => {
    const res = await invite(ANA, "  Duda@X.com ");
    expect(res.status).toBe(303);
    expect(access.state.emails.has("duda@x.com")).toBe(true);

    const page = await (await requestAs(ANA, res.headers.get("Location")!)).text();
    expect(page).toContain("Pronto! duda@x.com já pode entrar.");
    expect(page).toContain("https://wa.me/?text=");
    expect(page).toContain("Aguardando");
  });

  it("membro tem 1 convite; cancelar devolve a cota e tira do Access", async () => {
    const first = await invite(BETO, "eva@x.com");
    expect(first.status).toBe(303);

    const second = await invite(BETO, "fabi@x.com");
    expect(second.status).toBe(400);
    expect(await second.text()).toContain("Você não tem convites disponíveis");
    expect(access.state.emails.has("fabi@x.com")).toBe(false);

    const id = inviteId(first);
    expect((await cancel(BETO, id)).status).toBe(303);
    expect(await statusOf(id)).toBe("canceled");
    expect(access.state.emails.has("eva@x.com")).toBe(false);

    expect((await invite(BETO, "fabi@x.com")).status).toBe(303);
  });

  it("convite aceito continua contando na cota", async () => {
    const res = await invite(CHEFE, "gabi@x.com");
    // simula a Gabi entrando e convidando alguém
    await postAs("gabi@x.com", "/boas-vindas", { username: "gabi", displayName: "Gabi", acceptRules: "1" });
    expect(await statusOf(inviteId(res))).toBe("accepted");
    expect((await invite("gabi@x.com", "hugo@x.com")).status).toBe(303);
    expect((await invite("gabi@x.com", "ivo@x.com")).status).toBe(400);

    const page = await (await requestAs(CHEFE, "/convites")).text();
    expect(page).toContain("Entrou como Gabi");
  });

  it("admin convida sem limite", async () => {
    for (const email of ["a1@x.com", "a2@x.com", "a3@x.com"]) {
      expect((await invite(CHEFE, email)).status).toBe(303);
    }
    expect(await (await requestAs(CHEFE, "/convites")).text()).toContain("quantas pessoas quiser");
  });

  it("recusa email inválido, membro existente e convite repetido", async () => {
    const bad = await invite(CHEFE, "nao-e-email");
    expect(await bad.text()).toContain("não parece válido");

    const member = await invite(CHEFE, ANA);
    expect(member.status).toBe(400);
    expect(await member.text()).toContain("Ana já faz parte do Clube");

    await invite(CHEFE, "jo@x.com");
    const dup = await invite(CHEFE, "jo@x.com");
    expect(dup.status).toBe(400);
    expect(await dup.text()).toContain("já foi convidada por Chefe");
  });

  it("se o Access falhar, não registra o convite", async () => {
    access.state.fail = true;
    const res = await invite(CHEFE, "ko@x.com");
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("Não consegui liberar o acesso");
    const row = await env.DB.prepare("SELECT id FROM invites WHERE email = 'ko@x.com'").first();
    expect(row).toBeNull();
  });

  it("só quem convidou (ou admin) cancela, e só convite pendente", async () => {
    const res = await invite(CHEFE, "leo@x.com");
    const id = inviteId(res);
    expect((await cancel(ANA, id)).status).toBe(403);
    expect(await statusOf(id)).toBe("pending");
    expect((await cancel(CHEFE, id)).status).toBe(303);
    expect((await cancel(CHEFE, id)).status).toBe(404);
  });

  it("com Access ligado e sem API configurada, recusa convidar", async () => {
    // Modo local com Access "ligado" não é possível pelo login; testa o cliente direto.
    const { accessGroupClientFor } = await import("../src/lib/access-api");
    expect(() => accessGroupClientFor({ ...env, ACCESS_TEAM_DOMAIN: "x.cloudflareaccess.com" })).toThrow(
      /CF_API_TOKEN/,
    );
  });

  it("sem API e sem Access (local), convida só no banco", async () => {
    const res = await postAs(CHEFE, "/convites", { email: "local@x.com" });
    expect(res.status).toBe(303);
    expect(access.state.calls).toBe(0);
  });
});
