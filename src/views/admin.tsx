import type { Member } from "../auth/middleware";
import type { MemberRow } from "../lib/users";
import { QUOTA_MAX } from "../lib/users";
import { Layout } from "./layout";
import { UserLink } from "./profile";

const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export const AdminPage = ({ user, members, error }: { user: Member; members: MemberRow[]; error?: string }) => (
  <Layout title="Admin" user={user}>
    <div class="box">
      <h2>Membros</h2>
      <p class="muted">
        Desativar tira a pessoa do Access e bloqueia a conta na hora. O conteúdo dela continua no fórum.
      </p>
      {error && <p class="field-error">{error}</p>}
    </div>
    <table class="forum-table admin-table">
      <thead>
        <tr>
          <th>Membro</th>
          <th>Convites</th>
          <th class="col-last">Situação</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => {
          const isSelf = m.id === user.id;
          const isAdmin = m.role === "admin";
          return (
            <tr class={m.status === "disabled" ? "member-disabled" : ""}>
              <td>
                <UserLink username={m.username} name={m.displayName} />
                {isAdmin && <span class="role-badge">admin</span>}
                <div class="meta">
                  @{m.username} · {m.email}
                  <br />
                  desde {dateOnly.format(m.createdAt)}
                  {m.inviterName && ` · convidado por ${m.inviterName}`}
                </div>
              </td>
              <td>
                {isAdmin ? (
                  <span class="muted">sem limite</span>
                ) : (
                  <form method="post" action={`/admin/membros/${m.id}/cota`} class="quota-form">
                    <span>{m.invitesUsed} de</span>
                    <input
                      type="number"
                      name="quota"
                      value={String(m.inviteQuota)}
                      min={0}
                      max={QUOTA_MAX}
                      aria-label={`Cota de convites de ${m.displayName}`}
                    />
                    <button type="submit" class="link-button">
                      salvar
                    </button>
                  </form>
                )}
              </td>
              <td class="col-last">
                {m.status === "active" ? "Ativo" : "Desativado"}
                {!isSelf && !isAdmin && (
                  <form
                    method="post"
                    action={`/admin/membros/${m.id}/${m.status === "active" ? "desativar" : "reativar"}`}
                    class="inline-form"
                    data-confirm={
                      m.status === "active"
                        ? `Desativar ${m.displayName}? A pessoa perde o acesso ao Clube na hora.`
                        : `Reativar ${m.displayName}?`
                    }
                  >
                    {" · "}
                    <button type="submit" class={m.status === "active" ? "link-button danger" : "link-button"}>
                      {m.status === "active" ? "desativar" : "reativar"}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </Layout>
);
