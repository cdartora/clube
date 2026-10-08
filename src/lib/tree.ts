export type TreeItem = {
  id: number;
  parentId: number | null;
  score: number;
  createdAt: Date;
  deletedAt: Date | null;
};

export type TreeNode<T extends TreeItem> = T & { children: TreeNode<T>[] };

const bySiblingOrder = (a: TreeItem, b: TreeItem) =>
  b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;

/**
 * Monta a árvore de respostas. Irmãs ficam ordenadas por pontuação (maior
 * primeiro) e, no empate, da mais antiga para a mais nova. Respostas apagadas
 * só continuam na árvore se ainda tiverem respostas visíveis embaixo delas.
 */
export const buildTree = <T extends TreeItem>(items: T[]): TreeNode<T>[] => {
  const nodes = new Map<number, TreeNode<T>>();
  for (const item of items) nodes.set(item.id, { ...item, children: [] });

  const roots: TreeNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    (parent ? parent.children : roots).push(node);
  }

  const prune = (list: TreeNode<T>[]): TreeNode<T>[] =>
    list
      .map((n) => ({ ...n, children: prune(n.children) }))
      .filter((n) => !n.deletedAt || n.children.length > 0)
      .sort(bySiblingOrder);

  return prune(roots);
};
