import type { Child } from "hono/jsx";
import { Layout } from "./layout";

export const ErrorPage = ({ title, children }: { title: string; children: Child }) => (
  <Layout title={title}>
    <div class="box">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  </Layout>
);

export const NotInvitedPage = ({ email }: { email: string }) => (
  <ErrorPage title="Você não foi convidado">
    O Clube é fechado e só entra quem recebe convite de um membro. Se alguém te convidou, confira se
    entrou com o mesmo email do convite ({email}).
  </ErrorPage>
);
