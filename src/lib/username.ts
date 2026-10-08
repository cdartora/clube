// Mesmo formato validado em scripts/seed-admin.mjs.
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

const RESERVED = new Set(["admin", "clube", "sistema", "moderador", "regras", "convites", "anonimo"]);

export const normalizeUsername = (raw: string) => raw.trim().replace(/^@/, "").toLowerCase();

/** Devolve uma mensagem de erro, ou null se o apelido é válido. */
export const usernameError = (username: string): string | null => {
  if (!USERNAME_RE.test(username)) {
    return "O apelido deve ter de 3 a 20 caracteres: letras minúsculas, números ou _.";
  }
  if (RESERVED.has(username)) return "Esse apelido é reservado. Escolha outro.";
  return null;
};

export const DISPLAY_NAME_MAX = 40;
