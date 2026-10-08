import { raw } from "hono/html";
import type { Child } from "hono/jsx";
import type { User } from "../db/schema";

type LayoutProps = {
  title?: string;
  user?: Pick<User, "displayName" | "username"> | null;
  children: Child;
};

export const Layout = ({ title, user, children }: LayoutProps) => (
  <>
    {raw("<!doctype html>")}
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? `${title} · Clube` : "Clube"}</title>
        <link rel="stylesheet" href="/style.css" />
        <script src="/vendor/htmx-2.0.11.min.js" defer></script>
      </head>
      <body>
        <div class="wrap">
          <header class="masthead">
            <a href="/" class="logo">
              Clube
            </a>
            <span class="tagline">um cantinho entre amigos</span>
          </header>
          <nav class="navbar">
            <a href="/">Índice</a>
            {user && <a href="/regras">Regras</a>}
            {user && <span class="navbar-user">Olá, {user.displayName}</span>}
          </nav>
          <main>{children}</main>
          <footer class="footer">Clube · sem anúncios, sem algoritmo</footer>
        </div>
      </body>
    </html>
  </>
);
