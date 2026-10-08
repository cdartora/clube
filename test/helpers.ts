import { env } from "cloudflare:test";
import app from "../src/index";

/** Faz uma requisição ao app como se `email` estivesse logado (modo local, sem Access). */
export const requestAs = (email: string | undefined, path: string, init?: RequestInit) =>
  app.request(path, init, { ...env, DEV_USER_EMAIL: email });

export const insertUser = (
  id: number,
  email: string,
  username: string,
  displayName: string,
  status: "active" | "disabled" = "active",
) =>
  env.DB.prepare(
    "INSERT INTO users (id, email, username, display_name, status) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, email, username, displayName, status)
    .run();

/** POST de formulário como se `email` estivesse logado, vindo do próprio site. */
export const postAs = (email: string, path: string, fields: Record<string, string>, headers = {}) =>
  requestAs(email, path, {
    method: "POST",
    headers: { Origin: "http://localhost", ...headers },
    body: new URLSearchParams(fields),
  });
