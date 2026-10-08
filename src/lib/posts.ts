import type { User } from "../db/schema";

export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const BODY_MAX = 20_000;

export type PostErrors = { title?: string; body?: string };

export const titleError = (title: string) =>
  title.length < TITLE_MIN || title.length > TITLE_MAX
    ? `O título deve ter de ${TITLE_MIN} a ${TITLE_MAX} caracteres.`
    : undefined;

export const bodyError = (body: string) => {
  if (!body) return "Escreva alguma coisa.";
  if (body.length > BODY_MAX) return `O texto passou do limite de ${BODY_MAX.toLocaleString("pt-BR")} caracteres.`;
  return undefined;
};

/** Normaliza o texto vindo do formulário: quebras de linha do Windows e espaços nas pontas. */
export const cleanBody = (raw: unknown) => String(raw ?? "").replace(/\r\n?/g, "\n").trim();
export const cleanTitle = (raw: unknown) => String(raw ?? "").replace(/\s+/g, " ").trim();

/** Só o autor edita. */
export const canEdit = (user: User, authorId: number) => user.id === authorId;

/** O autor ou um admin podem apagar. */
export const canDelete = (user: User, authorId: number) => user.id === authorId || user.role === "admin";
