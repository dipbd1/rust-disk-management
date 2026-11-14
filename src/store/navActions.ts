import { getChildren, getGraphView, watchPath } from "../services/tauriBridge";
import { CHILD_PAGE_SIZE } from "../lib/limits";
import { ancestorChain, isDriveRoot } from "../lib/paths";
import { errorMessage } from "../lib/format";
import { applyIndexPage, applyList, capGraph, graphNodes, nodeByPath, upsert } from "./cache";
import { session, treeInflight } from "./session";
import type { FileStore } from "./types";
import type { StoreApi } from "zustand";

type SetFile = StoreApi<FileStore>["setState"];
type GetFile = StoreApi<FileStore>["getState"];

function unionIds(current: readonly string[], extra: readonly string[]): string[] {
  const next = current.slice();
  for (const id of extra) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

export async function ensureTreePage(set: SetFile, get: GetFile, path: string): Promise<void> {
  const known = nodeByPath(get().nodes, path);
  if (known && known.kind !== "folder") return;
  const existing = get().childPages[path];
  if (existing?.source === "index" && existing.nodes.length > 0) return;
  if (treeInflight.has(path)) return;
  treeInflight.add(path);
  try {
    const page = await getChildren(path, 0, CHILD_PAGE_SIZE, null);
    set((state) => applyIndexPage(state, page, false));
  } finally {
    treeInflight.delete(path);
  }
}

export async function refreshList(set: SetFile, get: GetFile, path: string, query: string): Promise<void> {
  const gen = ++session.list;
  const trimmed = query.trim();
  const known = nodeByPath(get().nodes, path);
  if (known && known.kind !== "folder") {
    if (gen !== session.list) return;
    set({ list: { parentPath: path, query: trimmed, nodes: [], total: 0, complete: true } });
    return;
  }
  const page = await getChildren(path, 0, CHILD_PAGE_SIZE, trimmed ? trimmed : null);
  if (gen !== session.list) return;
  set((state) => applyList(state, page, trimmed, false));
}

export async function loadGraph(set: SetFile, get: GetFile, path: string): Promise<void> {
  const gen = ++session.view;
  const view = capGraph(await getGraphView(path));
  if (gen !== session.view) return;
  if (get().focusedNodeId !== path) return;
  set((state) => ({
    graphView: view,
    nodes: upsert(state.nodes, graphNodes(view)),
  }));
}

function chainFromScanRoot(chain: string[], rootId: string | null): string[] {
  if (!rootId) return chain;
  const start = chain.findIndex((path) => path === rootId);
  return start >= 0 ? chain.slice(start) : chain;
}

/** A file has no directory to watch. Watch the folder that contains it. */
export function watchFocused(get: GetFile, id: string): string {
  const known = nodeByPath(get().nodes, id);
  if (!known || known.kind !== "file") return id;
  if (known.parentId) return known.parentId;
  const chain = ancestorChain(id);
  return chain.length >= 2 ? chain[chain.length - 2] : id;
}

export async function focusNode(set: SetFile, get: GetFile, id: string): Promise<void> {
  const gen = ++session.focus;
  const chain = chainFromScanRoot(ancestorChain(id), get().rootId);
  set((state) => ({
    focusedNodeId: id,
    selectedNodeId: id,
    expandedIds: unionIds(state.expandedIds, chain),
  }));
  try {
    for (const path of chain) {
      if (gen !== session.focus) return;
      await ensureTreePage(set, get, path);
    }
    if (gen !== session.focus) return;
    await Promise.all([refreshList(set, get, id, get().query), loadGraph(set, get, id)]);
    if (gen !== session.focus) return;
    try {
      await watchPath(watchFocused(get, id));
    } catch (error) {
      if (gen !== session.focus) return;
      set({ toast: errorMessage(error) });
    }
  } catch (error) {
    if (gen !== session.focus) return;
    const known = nodeByPath(get().nodes, id);
    if (!known || known.kind === "folder" || isDriveRoot(id)) set({ toast: errorMessage(error) });
  }
}

export async function toggleExpanded(set: SetFile, get: GetFile, id: string): Promise<void> {
  const node = get().nodes[id] ?? nodeByPath(get().nodes, id);
  if (!node || node.kind !== "folder") return;
  if (get().expandedIds.includes(node.id)) {
    set({ expandedIds: get().expandedIds.filter((item) => item !== node.id) });
    return;
  }
  set({ expandedIds: unionIds(get().expandedIds, [node.id]) });
  try {
    await ensureTreePage(set, get, node.path);
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function loadMoreTree(set: SetFile, get: GetFile, parentPath: string): Promise<void> {
  const existing = get().childPages[parentPath];
  if (existing?.source === "index" && existing.complete) return;
  if (treeInflight.has(parentPath)) return;
  const append = existing?.source === "index";
  const offset = append ? existing.nodes.length : 0;
  treeInflight.add(parentPath);
  try {
    const page = await getChildren(parentPath, offset, CHILD_PAGE_SIZE, null);
    set((state) => applyIndexPage(state, page, append && page.offset > 0));
  } catch (error) {
    set({ toast: errorMessage(error) });
  } finally {
    treeInflight.delete(parentPath);
  }
}

export async function loadMoreList(set: SetFile, get: GetFile): Promise<void> {
  const list = get().list;
  const focus = get().focusedNodeId;
  if (!list || !focus || list.complete || list.parentPath !== focus) return;
  if (list.query !== get().query.trim()) return;
  const gen = session.list;
  try {
    const page = await getChildren(focus, list.nodes.length, CHILD_PAGE_SIZE, list.query ? list.query : null);
    if (gen !== session.list) return;
    set((state) => applyList(state, page, list.query, page.offset > 0));
  } catch (error) {
    if (gen !== session.list) return;
    set({ toast: errorMessage(error) });
  }
}

export function setQuery(set: SetFile, get: GetFile, query: string): void {
  set({ query });
  const focus = get().focusedNodeId;
  if (!focus) return;
  void refreshList(set, get, focus, query).catch((error: unknown) => {
    set({ toast: errorMessage(error) });
  });
}
