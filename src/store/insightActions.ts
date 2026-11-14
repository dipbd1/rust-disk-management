import { INSIGHT_PAGE_SIZE } from "../lib/limits";
import { errorMessage } from "../lib/format";
import {
  extensionFiles,
  extensionRollup,
  growthDelta,
  largestFiles,
  pickScanFolder,
  searchIndex,
} from "../services/tauriBridge";
import type { FileNode, InsightPage, LargestOrder } from "../types/filesystem";
import { upsert } from "./cache";
import { focusNode } from "./navActions";
import { scanDrive } from "./scanActions";
import { session } from "./session";
import type { ExtensionTarget, FileStore } from "./types";
import type { StoreApi } from "zustand";

type SetFile = StoreApi<FileStore>["setState"];
type GetFile = StoreApi<FileStore>["getState"];

function mergePage(previous: InsightPage | null, page: InsightPage): InsightPage {
  if (!previous || page.offset === 0) return page;
  const seen = new Set(previous.nodes.map((node) => node.id));
  const nodes = previous.nodes.slice();
  for (const node of page.nodes) {
    if (!seen.has(node.id)) nodes.push(node);
  }
  return { ...page, nodes };
}

export async function loadLargest(set: SetFile, order: LargestOrder): Promise<void> {
  const gen = ++session.insight;
  set({ largestPage: null });
  try {
    const page = await largestFiles(0, INSIGHT_PAGE_SIZE, order.sort, order.descending);
    if (gen !== session.insight) return;
    set((state) => ({ largestPage: page, nodes: upsert(state.nodes, page.nodes) }));
  } catch (error) {
    if (gen !== session.insight) return;
    set({ toast: errorMessage(error) });
  }
}

export async function loadMoreLargest(set: SetFile, get: GetFile, order: LargestOrder): Promise<void> {
  const current = get().largestPage;
  if (!current || current.nodes.length >= current.total) return;
  const gen = session.insight;
  try {
    const page = await largestFiles(current.nodes.length, INSIGHT_PAGE_SIZE, order.sort, order.descending);
    if (gen !== session.insight) return;
    const merged = mergePage(get().largestPage, page);
    set((state) => ({ largestPage: merged, nodes: upsert(state.nodes, page.nodes) }));
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function searchWhole(set: SetFile, query: string): Promise<void> {
  const gen = ++session.search;
  const needle = query.trim();
  if (!needle) {
    set({ searchPage: { total: 0, offset: 0, nodes: [] } });
    return;
  }
  try {
    const page = await searchIndex(needle, 0, INSIGHT_PAGE_SIZE);
    if (gen !== session.search) return;
    set((state) => ({ searchPage: page, nodes: upsert(state.nodes, page.nodes) }));
  } catch (error) {
    if (gen !== session.search) return;
    set({ toast: errorMessage(error) });
  }
}

export async function loadMoreSearch(set: SetFile, get: GetFile, query: string): Promise<void> {
  const current = get().searchPage;
  const needle = query.trim();
  if (!current || !needle || current.nodes.length >= current.total) return;
  const gen = session.search;
  try {
    const page = await searchIndex(needle, current.nodes.length, INSIGHT_PAGE_SIZE);
    if (gen !== session.search) return;
    const merged = mergePage(get().searchPage, page);
    set((state) => ({ searchPage: merged, nodes: upsert(state.nodes, page.nodes) }));
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function loadExtensions(set: SetFile): Promise<void> {
  try {
    const extensions = await extensionRollup();
    set({ extensions, extensionTarget: null, extensionPage: null });
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function openExtension(set: SetFile, target: ExtensionTarget): Promise<void> {
  try {
    const page = await extensionFiles(target.extension, target.other, 0, INSIGHT_PAGE_SIZE);
    set((state) => ({ extensionTarget: target, extensionPage: page, nodes: upsert(state.nodes, page.nodes) }));
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function loadMoreExtension(set: SetFile, get: GetFile): Promise<void> {
  const target = get().extensionTarget;
  const current = get().extensionPage;
  if (!target || !current || current.nodes.length >= current.total) return;
  try {
    const page = await extensionFiles(target.extension, target.other, current.nodes.length, INSIGHT_PAGE_SIZE);
    const merged = mergePage(get().extensionPage, page);
    set((state) => ({ extensionPage: merged, nodes: upsert(state.nodes, page.nodes) }));
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function openLocated(set: SetFile, get: GetFile, node: FileNode): Promise<void> {
  set((state) => ({ nodes: { ...state.nodes, [node.id]: node }, selectedNodeId: node.id }));
  const target = node.kind === "folder" ? node.id : node.parentId;
  if (!target) return;
  await focusNode(set, get, target);
  if (node.kind !== "folder") set({ selectedNodeId: node.id });
}

export async function loadGrowth(set: SetFile): Promise<void> {
  try {
    set({ growth: await growthDelta() });
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function scanFolder(set: SetFile, get: GetFile): Promise<void> {
  try {
    const picked = await pickScanFolder();
    if (!picked) return;
    await scanDrive(set, get, picked, true);
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}
