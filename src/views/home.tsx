import type { User } from "../db/schema";
import { formatDateTime } from "../lib/format";
import { Layout } from "./layout";

export type TopicRow = {
  id: number;
  title: string;
  author: string;
  replyCount: number;
  lastActivityAt: Date;
  lastReplyBy: string | null;
  readState: "new" | "updated" | "read";
};

export const HomePage = ({ topics, user }: { topics: TopicRow[]; user: User }) => (
  <Layout user={user}>
    <div class="toolbar">
      <a href="/novo" class="button">
        Novo tópico
      </a>
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
                  por {t.author}
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
  </Layout>
);
