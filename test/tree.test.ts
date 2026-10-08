import { describe, expect, it } from "vitest";
import { buildTree } from "../src/lib/tree";

const item = (id: number, parentId: number | null, score = 0, minute = id, deleted = false) => ({
  id,
  parentId,
  score,
  createdAt: new Date(2026, 0, 1, 0, minute),
  deletedAt: deleted ? new Date() : null,
});

const ids = (nodes: ReturnType<typeof buildTree>) =>
  nodes.map((n): unknown => (n.children.length ? [n.id, ids(n.children)] : n.id));

describe("buildTree", () => {
  it("ordena irmãs por pontuação e, no empate, pela mais antiga", () => {
    const tree = buildTree([item(1, null, 0), item(2, null, 5), item(3, null, 0), item(4, 1, -1), item(5, 1, 2)]);
    expect(ids(tree)).toEqual([2, [1, [5, 4]], 3]);
  });

  it("remove apagadas sem filhas visíveis, mantém as que têm", () => {
    const tree = buildTree([
      item(1, null, 0, 1, true), // apagada, com filha viva
      item(2, 1),
      item(3, null, 0, 3, true), // apagada, só com filha apagada
      item(4, 3, 0, 4, true),
    ]);
    expect(ids(tree)).toEqual([[1, [2]]]);
  });
});
