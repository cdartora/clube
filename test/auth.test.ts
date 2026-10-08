import { env } from "cloudflare:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyAccessJwt } from "../src/auth/access";
import app from "../src/index";
import { insertUser, requestAs } from "./helpers";

beforeAll(async () => {
  await insertUser(1, "ana@x.com", "ana", "Ana");
  await insertUser(2, "beto@x.com", "beto", "Beto", "disabled");
});

describe("modo local (DEV_USER_EMAIL)", () => {
  it("deixa entrar um membro ativo e mostra o nome dele", async () => {
    const res = await requestAs("ana@x.com", "/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Olá, Ana");
  });

  it("ignora maiúsculas no email", async () => {
    const res = await requestAs("ANA@X.com", "/");
    expect(res.status).toBe(200);
  });

  it("barra quem não tem conta", async () => {
    const res = await requestAs("estranho@x.com", "/");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Você não foi convidado");
  });

  it("barra conta desativada", async () => {
    const res = await requestAs("beto@x.com", "/");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Conta desativada");
  });

  it("falha fechado quando não há nenhuma forma de login configurada", async () => {
    const res = await requestAs(undefined, "/");
    expect(res.status).toBe(500);
  });
});

describe("com Access configurado", () => {
  const accessEnv = {
    ...env,
    ACCESS_TEAM_DOMAIN: "clube.cloudflareaccess.com",
    ACCESS_AUD: "aud-123",
  };

  it("recusa requisição sem o token do Access", async () => {
    const res = await app.request("/", {}, accessEnv);
    expect(res.status).toBe(401);
  });

  it("ignora DEV_USER_EMAIL, para não abrir o fórum por engano", async () => {
    const res = await app.request("/", {}, { ...accessEnv, DEV_USER_EMAIL: "ana@x.com" });
    expect(res.status).toBe(401);
  });

  it("recusa token inválido", async () => {
    const res = await app.request(
      "/",
      { headers: { "Cf-Access-Jwt-Assertion": "nao.e.jwt" } },
      accessEnv,
    );
    expect(res.status).toBe(401);
  });
});

describe("verifyAccessJwt", () => {
  const config = { teamDomain: "clube.cloudflareaccess.com", aud: "aud-123" };
  let privateKey: CryptoKey;
  let jwks: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
    jwks = createLocalJWKSet({ keys: [jwk] });
  });

  const sign = (
    claims: Record<string, unknown>,
    { iss = `https://${config.teamDomain}`, aud = config.aud, exp = "1h" } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(privateKey);

  it("devolve o email (em minúsculas) de um token válido", async () => {
    const token = await sign({ email: "Ana@X.com" });
    expect(await verifyAccessJwt(token, config, jwks)).toBe("ana@x.com");
  });

  it("recusa token de outra aplicação (aud)", async () => {
    const token = await sign({ email: "ana@x.com" }, { aud: "outra" });
    expect(await verifyAccessJwt(token, config, jwks)).toBeNull();
  });

  it("recusa token de outro time (iss)", async () => {
    const token = await sign({ email: "ana@x.com" }, { iss: "https://outro.cloudflareaccess.com" });
    expect(await verifyAccessJwt(token, config, jwks)).toBeNull();
  });

  it("recusa token expirado", async () => {
    const token = await sign({ email: "ana@x.com" }, { exp: "-1m" });
    expect(await verifyAccessJwt(token, config, jwks)).toBeNull();
  });

  it("recusa token de serviço (sem email)", async () => {
    const token = await sign({ common_name: "bot" });
    expect(await verifyAccessJwt(token, config, jwks)).toBeNull();
  });
});
