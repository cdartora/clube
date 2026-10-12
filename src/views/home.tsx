import type { User } from "../db/schema";
import { formatDateTime } from "../lib/format";
import { Layout } from "./layout";

export type TopicRow = {
  id: number;
  title: string;
  author: string;
  authorUsername: string;
  replyCount: number;
  lastActivityAt: Date;
  lastReplyBy: string | null;
  readState: "new" | "updated" | "read";
};

const pageHref = (page: number) => (page === 1 ? "/" : `/?pagina=${page}`);

export const HomePage = ({
  topics,
  user,
  page = 1,
  hasNext = false,
}: {
  topics: TopicRow[];
  user: User;
  page?: number;
  hasNext?: boolean;
}) => (
  <Layout user={user}>
    <div class="toolbar">
      <a href="/novo" class="button">
        Novo tópico
      </a>
      {topics.some((t) => t.readState !== "read") && (
        <form method="post" action="/lidos" class="inline-form">
          <button type="submit" class="link-button">
            marcar tudo como lido
          </button>
        </form>
      )}
    </div>
    <table class="forum-table">
      <thead>
        <tr>
          <th class="col-topic">Tópico</th>
          <th class="col-num">Respostas</th>
          <th class="col-last">Última atividade</th>
        </tr>
      </thead>
      <tbody>
        {topics.length === 0 ? (
          <tr>
            <td colspan={3} class="empty">
              Nenhum tópico ainda. Que tal puxar o primeiro assunto?
            </td>
          </tr>
        ) : (
          topics.map((t) => (
            <tr class={t.readState === "read" ? "" : "unread"}>
              <td class="col-topic">
                <a href={`/t/${t.id}`} class="topic-title">
                  {t.title}
                </a>
                {t.readState === "new" && <span class="badge-new">novo</span>}
                {t.readState === "updated" && <span class="badge-new">novas respostas</span>}
                <div class="meta">
                  por <a href={`/u/${t.authorUsername}`}>{t.author}</a>
                  <span class="mobile-only"> · {t.replyCount} resp.</span>
                </div>
              </td>
              <td class="col-num">{t.replyCount}</td>
              <td class="col-last">
                {formatDateTime(t.lastActivityAt)}
                {t.lastReplyBy && <div class="meta">por {t.lastReplyBy}</div>}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
    {(page > 1 || hasNext) && (
      <nav class="pagination" aria-label="Páginas do índice">
        {page > 1 ? <a href={pageHref(page - 1)}>← mais recentes</a> : <span />}
        <span class="muted">página {page}</span>
        {hasNext ? <a href={pageHref(page + 1)}>mais antigos →</a> : <span />}
      </nav>
    )}
  </Layout>
);
