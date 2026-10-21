import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { findMentions, renderMarkdown } from "../src/lib/markdown";
import { insertUser, postAs, requestAs } from "./helpers";

const ANA = "ana@x.com";
const BETO = "beto@x.com";
const CAIO = "caio@x.com";
const DUDA = "duda@x.com";

const createTopic = async (email: string, body: string) => {
  const res = await postAs(email, "/novo", { title: "Assunto", body });
  return Number(res.headers.get("Location")!.split("/").pop());
};

const mentionsOf = async (userId: number) =>
  (
    await env.DB.prepare("SELECT actor_id, topic_id, reply_id FROM notifications WHERE user_id = ? AND type = 'mention' ORDER BY id")
      .bind(userId)
      .all<{ actor_id: number; topic_id: number; reply_id: number | null }>()
  ).results;

beforeAll(async () => {
  await insertUser(1, ANA, "ana", "Ana");
  await insertUser(2, BETO, "beto", "Beto");
  await insertUser(3, CAIO, "caio", "Caio");
  await insertUser(4, DUDA, "duda", "Duda", "disabled");
});

describe("menções no texto", () => {
  it("viram link para o perfil, na mesma aba", () => {
    const html = renderMarkdown("Fala @Beto, tudo bem?");
    expect(html).toContain('<a href="/u/beto" class="mention">@Beto</a>, tudo bem?');
    expect(html).not.toContain("_blank");
  });

  it("ignoram email, código e links", () => {
    const source = "Escreve para ana@gmail.com, `@caio` ou [@beto](https://x.example):\n\n```\n@duda\n```";
    expect(findMentions(source)).toEqual([]);
    expect(renderMarkdown(source)).not.toContain('class="mention"');
  });

  it("acham cada apelido uma vez, em minúsculas", () => {
    expect(findMentions("@ana e @Ana, (@caio_1) e @xy")).toEqual(["ana", "caio_1"]);
    // O editor visual salva o _ escapado.
    expect(findMentions("oi @caio\\_1")).toEqual(["caio_1"]);
  });

  it("links de fora continuam abrindo em outra aba", () => {
    expect(renderMarkdown("https://x.example")).toContain('target="_blank"');
    expect(renderMarkdown("[a](//x.example)")).toContain('target="_blank"');
  });
});

describe("avisos de menção", () => {
  it("avisam quem foi mencionado num tópico, menos o autor, desativados e apelidos que não existem", async () => {
    const t = await createTopic(ANA, "Bora @beto, @caio? Cadê a @duda e o @ninguem? Eu, @ana, vou.");
    expect(await mentionsOf(2)).toEqual([{ actor_id: 1, topic_id: t, reply_id: null }]);
    expect(await mentionsOf(3)).toHaveLength(1);
    expect(await mentionsOf(1)).toHaveLength(0);
    expect(await mentionsOf(4)).toHaveLength(0);

    const html = await (await requestAs(BETO, "/notificacoes")).text();
    expect(html).toContain("<strong>Ana</strong> mencionou você no tópico");
  });

  it("numa resposta, quem já recebe o aviso de resposta não recebe outro", async () => {
    const t = await createTopic(BETO, "Sem menções");
    const before = (await mentionsOf(2)).length;
    const res = await postAs(CAIO, `/t/${t}/respostas`, { body: "Concordo, @beto. E você, @ana?" });
    const replyId = Number(res.headers.get("Location")!.split("#r-")[1]);

    expect(await mentionsOf(2)).toHaveLength(before);
    expect((await mentionsOf(1)).at(-1)).toEqual({ actor_id: 3, topic_id: t, reply_id: replyId });
    const html = await (await requestAs(ANA, "/notificacoes")).text();
    expect(html).toContain("<strong>Caio</strong> mencionou você numa resposta em");
  });

  it("editar só avisa quem entrou agora", async () => {
    const t = await createTopic(CAIO, "Oi @ana");
    const ana = (await mentionsOf(1)).length;
    const beto = (await mentionsOf(2)).length;

    await postAs(CAIO, `/t/${t}/editar`, { title: "Assunto", body: "Oi @ana e @beto" });
    expect(await mentionsOf(1)).toHaveLength(ana);
    expect(await mentionsOf(2)).toHaveLength(beto + 1);
  });

  it("abrir o tópico marca a menção como lida", async () => {
    const t = await createTopic(BETO, "Ei @caio, olha isso");
    await requestAs(CAIO, `/t/${t}`);
    const unread = await env.DB.prepare(
      "SELECT count(*) AS n FROM notifications WHERE user_id = 3 AND topic_id = ? AND read_at IS NULL",
    )
      .bind(t)
      .first<{ n: number }>();
    expect(unread?.n).toBe(0);
  });
});
