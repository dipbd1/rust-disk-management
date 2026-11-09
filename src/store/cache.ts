import type { ChildPage, FileData, FolderList } from "./types";
import type { ChildrenPage, DeleteResult, FileNode, GraphView, ScanProgress } from "../types/filesystem";
import { CHILD_PAGE_SIZE, GRAPH_CHILD_CAP } from "../lib/limits";
import { isRemovedPath, nearestAncestorId } from "../lib/paths";

export function upsert(nodes: Record<string, FileNode>, incoming: readonly FileNode[]): Record<string, FileNode> {
  if (incoming.length === 0) return nodes;
  const next = { ...nodes };
  for (const node of incoming) next[node.id] = node;
  return next;
}

export function nodeByPath(nodes: Record<string, FileNode>, path: string): FileNode | undefined {
  const direct = nodes[path];
  if (direct) return direct;
  for (const node of Object.values(nodes)) {
    if (node.id === path || node.path === path) return node;
  }
  return undefined;
}

export function capGraph(view: GraphView): GraphView {
  return {
    focus: view.focus,
    children: view.children.slice(0, GRAPH_CHILD_CAP),
    other: view.other,
  };
}

export function graphNodes(view: GraphView): FileNode[] {
  const nodes = [view.focus, ...view.children];
  if (view.other) nodes.push(view.other);
  return nodes;
}

export function placeholderNode(mount: string, label: string, usedBytes: number): FileNode {
  return {
    id: mount,
    name: label || mount.replace(/\\$/, ""),
    path: mount,
    parentId: null,
    kind: "folder",
    category: "folder",
    sizeBytes: Math.max(0, usedBytes),
    childCount: 0,
    percentOfParent: 0,
  };
}

export function applyPreview(state: FileData, progress: ScanProgress): Partial<FileData> {
  const incoming = progress.root ? [progress.root, ...progress.topLevel] : progress.topLevel;
  const nodes = upsert(state.nodes, incoming);
  let childPages = state.childPages;
  let rootId = state.rootId;
  let expandedIds = state.expandedIds;
  let focusedNodeId = state.focusedNodeId;
  let selectedNodeId = state.selectedNodeId;
  if (progress.root) {
    rootId = progress.root.id;
    if (!expandedIds.includes(progress.root.id)) expandedIds = [...expandedIds, progress.root.id];
    if (!focusedNodeId) focusedNodeId = progress.root.id;
    if (!selectedNodeId) selectedNodeId = progress.root.id;
    const existing = childPages[progress.root.path];
    if (!existing || existing.source === "preview") {
      childPages = {
        ...childPages,
        [progress.root.path]: {
          parentPath: progress.root.path,
          nodes: progress.topLevel,
          total: Math.max(progress.topLevel.length, progress.root.childCount),
          complete: false,
          source: "preview",
        },
      };
    }
  }
  return {
    nodes,
    childPages,
    rootId,
    expandedIds,
    focusedNodeId,
    selectedNodeId,
    progress,
    scanStatus: progress.cancelled ? "cancelled" : "scanning",
  };
}

export function applyIndexPage(state: FileData, page: ChildrenPage, append: boolean): Partial<FileData> {
  const previous = state.childPages[page.parentPath];
  const base = append && previous ? previous.nodes : [];
  const seen = new Set(base.map((node) => node.id));
  const merged = base.slice();
  for (const node of page.nodes) {
    if (!seen.has(node.id)) merged.push(node);
  }
  const pageEntry: ChildPage = {
    parentPath: page.parentPath,
    nodes: merged,
    total: page.total,
    complete: merged.length >= page.total || page.nodes.length < CHILD_PAGE_SIZE,
    source: "index",
  };
  return {
    nodes: upsert(state.nodes, page.nodes),
    childPages: { ...state.childPages, [page.parentPath]: pageEntry },
  };
}

export function applyList(state: FileData, page: ChildrenPage, query: string, append: boolean): Partial<FileData> {
  const previous = append && state.list?.parentPath === page.parentPath ? state.list.nodes : [];
  const seen = new Set(previous.map((node) => node.id));
  const merged = previous.slice();
  for (const node of page.nodes) {
    if (!seen.has(node.id)) merged.push(node);
  }
  const list: FolderList = {
    parentPath: page.parentPath,
    query,
    nodes: merged,
    total: page.total,
    complete: merged.length >= page.total || page.nodes.length < CHILD_PAGE_SIZE,
  };
  return { nodes: upsert(state.nodes, page.nodes), list };
}

export function applyDelete(state: FileData, result: DeleteResult): Partial<FileData> {
  const removed = result.removedPath;
  const nodes = { ...state.nodes };
  for (const id of Object.keys(nodes)) {
    if (isRemovedPath(nodes[id].path, removed) || isRemovedPath(id, removed)) delete nodes[id];
  }
  for (const ancestor of result.ancestors) nodes[ancestor.id] = ancestor;

  const childPages = { ...state.childPages };
  for (const key of Object.keys(childPages)) {
    if (isRemovedPath(key, removed)) {
      delete childPages[key];
      continue;
    }
    const page = childPages[key];
    const nextNodes: FileNode[] = [];
    let changed = false;
    for (const node of page.nodes) {
      if (isRemovedPath(node.path, removed)) {
        changed = true;
        continue;
      }
      const ancestor = result.ancestors.find((item) => item.id === node.id);
      if (ancestor) {
        nextNodes.push(ancestor);
        changed = true;
      } else {
        nextNodes.push(node);
      }
    }
    if (changed) {
      childPages[key] = {
        ...page,
        nodes: nextNodes,
        total: Math.max(nextNodes.length, page.total - (page.nodes.length - nextNodes.length)),
      };
    }
  }

  let list = state.list;
  if (list && !isRemovedPath(list.parentPath, removed)) {
    const nextNodes = list.nodes
      .filter((node) => !isRemovedPath(node.path, removed))
      .map((node) => result.ancestors.find((item) => item.id === node.id) ?? node);
    list = {
      ...list,
      nodes: nextNodes,
      total: Math.max(nextNodes.length, list.total - (list.nodes.length - nextNodes.length)),
    };
  } else if (list) {
    list = null;
  }

  const expandedIds = state.expandedIds.filter((id) => !isRemovedPath(id, removed));
  const focusGone = state.focusedNodeId !== null && isRemovedPath(state.focusedNodeId, removed);
  const parentId = nearestAncestorId(result.ancestors, removed) ?? state.rootId;
  const focusedNodeId = focusGone ? parentId : state.focusedNodeId;
  const selectedGone = state.selectedNodeId !== null && isRemovedPath(state.selectedNodeId, removed);
  const selectedNodeId = selectedGone ? focusedNodeId : state.selectedNodeId;

  let graphView = state.graphView;
  if (graphView) {
    const patch = (node: FileNode) => result.ancestors.find((item) => item.id === node.id) ?? node;
    if (isRemovedPath(graphView.focus.path, removed)) {
      graphView = null;
    } else {
      graphView = {
        focus: patch(graphView.focus),
        children: graphView.children.filter((node) => !isRemovedPath(node.path, removed)).map(patch),
        other: graphView.other && !isRemovedPath(graphView.other.path, removed) ? patch(graphView.other) : null,
      };
    }
  }

  return {
    nodes,
    childPages,
    list,
    expandedIds,
    focusedNodeId,
    selectedNodeId,
    graphView,
    drainingId: null,
  };
}
