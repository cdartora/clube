import type { Member } from "../auth/middleware";
import { formatDateTime } from "../lib/format";
import type { NotificationRow } from "../lib/notifications";
import { Layout } from "./layout";

const describe = (n: NotificationRow) => {
  if (n.type === "reply") {
    return n.isReplyToReply ? "respondeu sua resposta em" : "respondeu seu tópico";
  }
  const where = n.replyId ? "sua resposta em" : "seu tópico";
  return n.otherClappers > 0 ? `aplaudiram ${where}` : `aplaudiu ${where}`;
};

const actorLabel = (n: NotificationRow) => {
  if (n.type !== "clap" || n.otherClappers === 0) return n.actorName;
  return `${n.actorName} e mais ${n.otherClappers === 1 ? "1 pessoa" : `${n.otherClappers} pessoas`}`;
};

const link = (n: NotificationRow) => (n.replyId ? `/t/${n.topicId}#r-${n.replyId}` : `/t/${n.topicId}`);

export const NotificationsPage = ({ user, items }: { user: Member; items: NotificationRow[] }) => (
  <Layout title="Notificações" user={user}>
    <div class="toolbar">
      {user.unreadCount ? (
        <form method="post" action="/notificacoes/lidas" class="inline-form">
          <button type="submit" class="button">
            Marcar todas como lidas
          </button>
        </form>
      ) : null}
    </div>
    <table class="forum-table notifications">
      <thead>
        <tr>
          <th>Notificações</th>
          <th class="col-last">Quando</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colspan={2} class="empty">
              Nada por aqui ainda. Quando alguém responder ou aplaudir algo seu, aparece aqui.
            </td>
          </tr>
        ) : (
          items.map((n) => (
            <tr class={n.readAt ? "" : "unread"}>
              <td>
                <span class="notif-icon" aria-hidden="true">
                  {n.type === "clap" ? "👏" : "💬"}
                </span>{" "}
                <strong>{actorLabel(n)}</strong> {describe(n)}{" "}
                <a href={link(n)} class="topic-title">
                  {n.topicTitle}
                </a>
                {!n.readAt && <span class="badge-new">nova</span>}
              </td>
              <td class="col-last">{formatDateTime(n.createdAt)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </Layout>
);
