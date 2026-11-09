import type { FileNode } from "../../types/filesystem";
import type { ChildPage } from "../../store/types";

export type TreeRow =
  | { kind: "node"; key: string; node: FileNode; depth: number }
  | { kind: "more"; key: string; parentPath: string; depth: number };

export function flattenFolders(
  rootId: string | null,
  nodes: Record<string, FileNode>,
  pages: Record<string, ChildPage>,
  expanded: readonly string[],
): TreeRow[] {
  if (!rootId || !nodes[rootId]) return [];
  const open = new Set(expanded);
  const rows: TreeRow[] = [];
  const walk = (id: string, depth: number) => {
    const node = nodes[id];
    if (!node || node.kind !== "folder") return;
    rows.push({ kind: "node", key: node.id, node, depth });
    if (!open.has(node.id) && !open.has(node.path)) return;
    const page = pages[node.path];
    if (!page) {
      rows.push({ kind: "more", key: `more:${node.path}`, parentPath: node.path, depth: depth + 1 });
      return;
    }
    for (const child of page.nodes) {
      if (child.kind === "folder") walk(child.id, depth + 1);
    }
    if (!page.complete) {
      rows.push({ kind: "more", key: `more:${node.path}`, parentPath: node.path, depth: depth + 1 });
    }
  };
  walk(rootId, 0);
  return rows;
}
