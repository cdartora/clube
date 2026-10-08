import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await env.DB.prepare(
    "INSERT INTO users (id, email, username, display_name) VALUES (1, 'a@x.com', 'ana', 'Ana')",
  ).run();
});

describe("restrições do banco", () => {
  it("aceita voto +1 e -1, recusa outros valores", async () => {
    const vote = (id: number, value: number) =>
      env.DB.prepare(
        "INSERT INTO votes (user_id, target_type, target_id, value) VALUES (1, 'topic', ?, ?)",
      )
        .bind(id, value)
        .run();

    await vote(1, 1);
    await vote(2, -1);
    await expect(vote(3, 2)).rejects.toThrow(/CHECK/);
  });

  it("limita os aplausos a 10 por pessoa em cada post", async () => {
    const clap = (id: number, count: number) =>
      env.DB.prepare(
        "INSERT INTO claps (user_id, target_type, target_id, count) VALUES (1, 'reply', ?, ?)",
      )
        .bind(id, count)
        .run();

    await clap(1, 10);
    await expect(clap(2, 11)).rejects.toThrow(/CHECK/);
    await expect(clap(3, 0)).rejects.toThrow(/CHECK/);
  });
});
