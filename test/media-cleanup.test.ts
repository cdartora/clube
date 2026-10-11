import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { cleanupMedia, ORPHAN_GRACE_MS } from "../src/lib/media-cleanup";
import { insertUser, postAs, requestAs } from "./helpers";

const ANA = "ana@x.com";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3, 4]);

const upload = async () => {
  const body = new FormData();
  body.append("file", new File([PNG], "f.png"));
  const res = await requestAs(ANA, "/midia", { method: "POST", headers: { Origin: "http://localhost" }, body });
  const { url, markdown } = await res.json<{ url: string; markdown: string }>();
  return { key: url.slice(3), markdown };
};

const newTopic = async (body: string) => {
  const res = await postAs(ANA, "/novo", { title: "Fotos", body });
  return Number(res.headers.get("Location")!.split("/").pop());
};

const exists = async (key: string) => (await env.MEDIA.head(key)) !== null;
const tracked = async (key: string) =>
  (await env.DB.prepare("SELECT 1 FROM media WHERE key = ?").bind(key).first()) !== null;

const later = (ms: number) => new Date(Date.now() + ms);

beforeAll(() => insertUser(1, ANA, "ana", "Ana"));

describe("limpeza diária de mídia", () => {
  it("apaga só o que nenhum post visível usa, depois do prazo", async () => {
    const inTopic = await upload();
    const inReply = await upload();
    const abandoned = await upload();
    const inDeletedTopic = await upload();
    const avatar = await upload();

    const topicId = await newTopic(`Olha ${inTopic.markdown}`);
    await postAs(ANA, `/t/${topicId}/respostas`, { body: inReply.markdown });
    const deletedId = await newTopic(inDeletedTopic.markdown);
    await postAs(ANA, `/t/${deletedId}/apagar`, {});
    await env.DB.prepare("UPDATE users SET avatar_key = ? WHERE id = 1").bind(avatar.key).run();

    // Ainda dentro do prazo: quem enviou pode estar escrevendo o post.
    expect((await cleanupMedia(env, later(ORPHAN_GRACE_MS / 2))).deleted).toBe(0);
    expect(await exists(abandoned.key)).toBe(true);

    const result = await cleanupMedia(env, later(ORPHAN_GRACE_MS * 2));
    expect(result.deleted).toBe(2);
    expect(result.freedBytes).toBe(2 * PNG.length);
    for (const kept of [inTopic, inReply, avatar]) {
      expect(await exists(kept.key)).toBe(true);
      expect(await tracked(kept.key)).toBe(true);
    }
    for (const gone of [abandoned, inDeletedTopic]) {
      expect(await exists(gone.key)).toBe(false);
      expect(await tracked(gone.key)).toBe(false);
    }
  });

  it("acerta a tabela com o bucket", async () => {
    // Arquivo de antes da tabela existir, ainda usado num post: passa a contar no espaço.
    const old = `posts/1/${crypto.randomUUID()}.png`;
    await env.MEDIA.put(old, PNG, { customMetadata: { userId: "1" } });
    await newTopic(`![](/m/${old})`);
    // Registro de um arquivo que já não está no bucket: sai da conta.
    const missing = `posts/1/${crypto.randomUUID()}.png`;
    await env.DB.prepare("INSERT INTO media (key, user_id, size) VALUES (?, 1, 999)").bind(missing).run();

    const result = await cleanupMedia(env, later(ORPHAN_GRACE_MS * 2));
    expect(result).toMatchObject({ deleted: 0, adopted: 1, forgotten: 1 });
    expect(await tracked(old)).toBe(true);
    expect(await tracked(missing)).toBe(false);
  });
});

describe("contador de notificações", () => {
  it("fotos e vídeos não consultam as notificações", async () => {
    const { key } = await upload();
    // Sem a tabela de notificações, a página quebra, mas a mídia continua saindo.
    await env.DB.prepare("ALTER TABLE notifications RENAME TO notifications_off").run();
    try {
      expect((await requestAs(ANA, `/m/${key}`)).status).toBe(200);
      expect((await requestAs(ANA, "/")).status).toBe(500);
    } finally {
      await env.DB.prepare("ALTER TABLE notifications_off RENAME TO notifications").run();
    }
  });
});
