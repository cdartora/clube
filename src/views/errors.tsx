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
