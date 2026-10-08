import { describe, expect, it } from "vitest";
import { AccessApiError, createAccessGroupClient } from "../src/lib/access-api";

const makeFetch = (initial: string[], opts: { failPut?: boolean } = {}) => {
  const requests: { method: string; body?: unknown; auth: string | null }[] = [];
  let include = initial.map((email) => ({ email: { email } }));
  const fetchFn = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, body, auth: new Headers(init?.headers).get("Authorization") });
    if (method === "PUT") {
      if (opts.failPut) {
        return Response.json({ success: false, errors: [{ message: "sem permissão" }] }, { status: 403 });
      }
      include = body.include;
    }
    return Response.json({
      success: true,
      result: { name: "clube-membros", include, exclude: [{ geo: { country_code: "XX" } }], require: [] },
    });
  }) as typeof fetch;
  return { fetchFn, requests, current: () => include };
};

const config = { token: "t0k3n", accountId: "acc", groupId: "grp" };

describe("cliente da API do Access", () => {
  it("adiciona email preservando o resto do grupo", async () => {
    const api = makeFetch(["ana@x.com"]);
    await createAccessGroupClient(config, api.fetchFn).addEmail("Beto@X.com");

    expect(api.current()).toEqual([{ email: { email: "ana@x.com" } }, { email: { email: "beto@x.com" } }]);
    const put = api.requests.find((r) => r.method === "PUT");
    expect(put?.body).toMatchObject({ name: "clube-membros", exclude: [{ geo: { country_code: "XX" } }] });
    expect(put?.auth).toBe("Bearer t0k3n");
  });

  it("não grava nada se o email já está no grupo", async () => {
    const api = makeFetch(["ana@x.com"]);
    await createAccessGroupClient(config, api.fetchFn).addEmail("ANA@x.com");
    expect(api.requests.map((r) => r.method)).toEqual(["GET"]);
  });

  it("remove email", async () => {
    const api = makeFetch(["ana@x.com", "beto@x.com"]);
    await createAccessGroupClient(config, api.fetchFn).removeEmail("beto@x.com");
    expect(api.current()).toEqual([{ email: { email: "ana@x.com" } }]);
  });

  it("propaga erro da API com a mensagem", async () => {
    const api = makeFetch([], { failPut: true });
    const promise = createAccessGroupClient(config, api.fetchFn).addEmail("x@x.com");
    await expect(promise).rejects.toThrow(AccessApiError);
    await expect(promise).rejects.toThrow(/403: sem permissão/);
  });
});
