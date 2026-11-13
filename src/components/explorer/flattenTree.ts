import type { FileNode } from "../../types/filesystem";
import type { ChildPage } from "../../store/types";

export type TreeRow =
  | { kind: "node"; key: string; node: FileNode; depth: number }
  | { kind: "more"; key: string; parentPath: string; depth: number };

export function flattenTree(
  rootId: string | null,
  nodes: Record<string, FileNode>,
  pages: Record<string, ChildPage>,
  expanded: readonly string[],
): TreeRow[] {
  if (!rootId || !nodes[rootId]) return [];
  const open = new Set(expanded);
  const rows: TreeRow[] = [];
  const walk = (id: string, depth: number, fallback?: FileNode) => {
    const node = nodes[id] ?? fallback;
    if (!node || node.kind === "aggregate") return;
    rows.push({ kind: "node", key: node.id, node, depth });
    if (node.kind !== "folder") return;
    if (!open.has(node.id) && !open.has(node.path)) return;
    const page = pages[node.path];
    if (!page) {
      rows.push({ kind: "more", key: `more:${node.path}`, parentPath: node.path, depth: depth + 1 });
      return;
    }
    for (const child of page.nodes) {
      if (child.kind === "aggregate") continue;
      walk(child.id, depth + 1, child);
    }
    if (!page.complete) {
      rows.push({ kind: "more", key: `more:${node.path}`, parentPath: node.path, depth: depth + 1 });
    }
  };
  walk(rootId, 0);
  return rows;
}
