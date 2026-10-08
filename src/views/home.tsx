import { Layout } from "./layout";

export type TopicRow = {
  id: number;
  title: string;
  author: string;
  replyCount: number;
  lastActivityAt: Date;
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export const HomePage = ({ topics }: { topics: TopicRow[] }) => (
  <Layout>
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
            <tr>
              <td class="col-topic">
                <a href={`/t/${t.id}`} class="topic-title">
                  {t.title}
                </a>
                <div class="meta">por {t.author}</div>
              </td>
              <td class="col-num">{t.replyCount}</td>
              <td class="col-last">{dateFmt.format(t.lastActivityAt)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </Layout>
);
