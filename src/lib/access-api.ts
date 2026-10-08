// Libera e bloqueia emails no grupo do Cloudflare Access que dá entrada no Clube.
// Docs: https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/groups/

type Rule = Record<string, unknown>;

type AccessGroup = {
  name: string;
  include: Rule[];
  exclude?: Rule[];
  require?: Rule[];
  is_default?: boolean;
};

type ApiResponse<T> = { success: boolean; errors?: { message: string }[]; result: T };

export type AccessGroupClient = {
  addEmail(email: string): Promise<void>;
  removeEmail(email: string): Promise<void>;
};

export type AccessApiConfig = { token: string; accountId: string; groupId: string };

const emailOf = (rule: Rule) => {
  const value = (rule.email as { email?: unknown } | undefined)?.email;
  return typeof value === "string" ? value.toLowerCase() : null;
};

export class AccessApiError extends Error {}

export const createAccessGroupClient = (
  config: AccessApiConfig,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): AccessGroupClient => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/access/groups/${config.groupId}`;
  const headers = { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" };

  const call = async <T,>(init: RequestInit = {}): Promise<T> => {
    const res = await fetchFn(url, { ...init, headers });
    const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
    if (!res.ok || !body?.success) {
      const detail = body?.errors?.map((e) => e.message).join("; ") || res.statusText;
      throw new AccessApiError(`API do Access respondeu ${res.status}: ${detail}`);
    }
    return body.result;
  };

  // O grupo só pode ser trocado inteiro: lê, ajusta a lista e grava de volta.
  const update = async (change: (include: Rule[]) => Rule[] | null) => {
    const group = await call<AccessGroup>();
    const include = change(group.include ?? []);
    if (!include) return; // nada a mudar
    await call({
      method: "PUT",
      body: JSON.stringify({
        name: group.name,
        include,
        exclude: group.exclude ?? [],
        require: group.require ?? [],
        ...(group.is_default !== undefined && { is_default: group.is_default }),
      }),
    });
  };

  return {
    addEmail: (email) =>
      update((include) =>
        include.some((r) => emailOf(r) === email.toLowerCase())
          ? null
          : [...include, { email: { email: email.toLowerCase() } }],
      ),
    removeEmail: (email) =>
      update((include) => {
        const kept = include.filter((r) => emailOf(r) !== email.toLowerCase());
        return kept.length === include.length ? null : kept;
      }),
  };
};

/** Sem a API configurada (desenvolvimento local), convites só mexem no banco. */
const localClient: AccessGroupClient = {
  addEmail: async (email) => console.log(`[modo local] liberaria ${email} no Access`),
  removeEmail: async (email) => console.log(`[modo local] removeria ${email} do Access`),
};

export const accessGroupClientFor = (env: Env): AccessGroupClient => {
  const { CF_API_TOKEN, CF_ACCOUNT_ID, ACCESS_GROUP_ID } = env;
  if (CF_API_TOKEN && CF_ACCOUNT_ID && ACCESS_GROUP_ID) {
    return createAccessGroupClient({ token: CF_API_TOKEN, accountId: CF_ACCOUNT_ID, groupId: ACCESS_GROUP_ID });
  }
  if (env.ACCESS_TEAM_DOMAIN) {
    // Access ligado mas sem API: convidar sem liberar o email deixaria o convidado preso do lado de fora.
    throw new AccessApiError("Convites precisam de CF_API_TOKEN, CF_ACCOUNT_ID e ACCESS_GROUP_ID configurados.");
  }
  return localClient;
};
