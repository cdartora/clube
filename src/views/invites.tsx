import type { User } from "../db/schema";
import { formatDateTime } from "../lib/format";
import type { InviteRow } from "../lib/invites";
import { FieldError } from "./form";
import { Layout } from "./layout";

type Props = {
  user: User;
  left: number;
  invites: InviteRow[];
  siteUrl: string;
  justInvited?: string;
  values?: { email: string };
  error?: string;
};

const whatsappLink = (siteUrl: string, email: string) =>
  `https://wa.me/?text=${encodeURIComponent(
    `Oi! Te convidei para o Clube, nosso fórum entre amigos. Entra por aqui: ${siteUrl}\n\nNa hora do login, use o email ${email} e digite o código que chegar nele.`,
  )}`;

const statusLabel = (row: InviteRow) => {
  if (row.status === "accepted") return `Entrou${row.memberName ? ` como ${row.memberName}` : ""}`;
  if (row.status === "canceled") return "Cancelado";
  return "Aguardando";
};

export const InvitesPage = ({ user, left, invites, siteUrl, justInvited, values, error }: Props) => (
  <Layout title="Convites" user={user}>
    {justInvited && (
      <div class="box notice">
        <h3>Pronto! {justInvited} já pode entrar.</h3>
        <p>Agora é com você: mande o link do Clube para a pessoa.</p>
        <p class="share">
          <input class="copy-field" value={siteUrl} readonly aria-label="Link do Clube" />
          <button type="button" class="button" data-copy={siteUrl}>
            Copiar link
          </button>
          <a class="button whatsapp" href={whatsappLink(siteUrl, justInvited)} target="_blank" rel="noopener noreferrer">
            Mandar pelo WhatsApp
          </a>
        </p>
        <p class="hint">
          No login, ela informa o email <strong>{justInvited}</strong>, recebe um código e entra direto na tela de
          boas-vindas.
        </p>
      </div>
    )}

    <div class="box">
      <h2>Convidar alguém</h2>
      {left > 0 ? (
        <>
          <p>
            {Number.isFinite(left)
              ? left === 1
                ? "Você tem 1 convite."
                : `Você tem ${left} convites.`
              : "Como admin, você pode convidar quantas pessoas quiser."}{" "}
            Lembre da regra da casa: só convide quem você receberia na sua casa.
          </p>
          <form method="post" action="/convites" class="form">
            <label for="email">Email da pessoa</label>
            <div class="hint">É com este email que ela vai fazer login.</div>
            <input id="email" name="email" type="email" value={values?.email} required autocomplete="off" />
            <FieldError msg={error} />
            <button type="submit" class="button">
              Convidar
            </button>
          </form>
        </>
      ) : (
        <>
          <FieldError msg={error} />
          <p>
            Você já usou seu convite. Se um convite pendente for cancelado, ele volta para você. Precisa de mais?
            Fale com um admin.
          </p>
        </>
      )}
    </div>

    {invites.length > 0 && (
      <table class="forum-table invites-table">
        <thead>
          <tr>
            <th>Seus convites</th>
            <th class="col-last">Situação</th>
          </tr>
        </thead>
        <tbody>
          {invites.map((row) => (
            <tr class={`invite-${row.status}`}>
              <td>
                {row.email}
                <div class="meta">convidado em {formatDateTime(row.createdAt)}</div>
              </td>
              <td class="col-last">
                {statusLabel(row)}
                {row.status === "pending" && (
                  <form
                    method="post"
                    action={`/convites/${row.id}/cancelar`}
                    class="inline-form"
                    data-confirm={`Cancelar o convite de ${row.email}? O email deixa de ter acesso.`}
                  >
                    {" · "}
                    <button type="submit" class="link-button danger">
                      cancelar
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </Layout>
);
