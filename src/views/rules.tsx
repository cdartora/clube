import { RulesList } from "../content/rules";
import type { User } from "../db/schema";
import { Layout } from "./layout";

export const RulesPage = ({ user }: { user: User }) => (
  <Layout title="Regras da casa" user={user}>
    <div class="box">
      <h2>Regras da casa</h2>
      <RulesList />
    </div>
  </Layout>
);
