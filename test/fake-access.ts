import { vi } from "vitest";

/**
 * Simula a API de grupos do Cloudflare Access trocando o fetch global.
 * Guarda os emails do grupo em memória e permite forçar falhas.
 */
export const fakeAccessApi = () => {
  const state = { emails: new Set<string>(), fail: false, calls: 0 };
  const group = () => ({
    id: "grp",
    name: "clube-membros",
    include: [...state.emails].map((email) => ({ email: { email } })),
    exclude: [],
    require: [],
  });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.cloudflare.com/")) throw new Error(`fetch inesperado: ${url}`);
    state.calls++;
    if (state.fail) return json({ success: false, errors: [{ message: "boom" }], result: null }, 500);
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      state.emails = new Set(body.include.map((r: { email: { email: string } }) => r.email.email));
    }
    return json({ success: true, errors: [], result: group() });
  });

  return { state, restore: () => spy.mockRestore() };
};

export const accessApiEnv = {
  CF_API_TOKEN: "token-de-teste",
  CF_ACCOUNT_ID: "conta",
  ACCESS_GROUP_ID: "grp",
};
