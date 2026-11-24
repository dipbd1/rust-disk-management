import type { GraphView } from "../types/filesystem";
import { errorMessage, formatBytes } from "../lib/format";
import { pathTail, singlePreview } from "../lib/deletePreview";
import { isDriveRoot } from "../lib/paths";
import { copyPath, permanentDelete, revealInExplorer, trashPath, watchPath } from "../services/tauriBridge";
import { applyDelete, nodeByPath } from "./cache";
import { loadGraph, refreshList, watchFocused } from "./navActions";
import { trashLocks } from "./session";
import type { FileStore } from "./types";
import type { StoreApi } from "zustand";

type SetFile = StoreApi<FileStore>["setState"];
type GetFile = StoreApi<FileStore>["getState"];

function canDestroy(state: FileStore, path: string): boolean {
  if (isDriveRoot(path)) return false;
  const node = nodeByPath(state.nodes, path);
  if (!node) return true;
  return node.kind !== "aggregate" && !isDriveRoot(node.path);
}

function inGraph(view: GraphView | null, path: string): boolean {
  if (!view) return false;
  if (view.focus.path === path || view.focus.id === path) return true;
  if (view.children.some((node) => node.path === path || node.id === path)) return true;
  return view.other?.path === path || view.other?.id === path;
}

async function commit(set: SetFile, get: GetFile, path: string, mode: "trash" | "permanent"): Promise<void> {
  if (trashLocks.has(path)) return;
  trashLocks.add(path);
  const before = get().focusedNodeId;
  try {
    const result = mode === "trash" ? await trashPath(path) : await permanentDelete(path);
    set((state) => ({
      ...applyDelete(state, result),
      toast:
        mode === "trash"
          ? `Moved to the Recycle Bin · ${formatBytes(result.freedBytes)} freed`
          : `Permanently deleted · ${formatBytes(result.freedBytes)} freed`,
      largestPage: null,
      searchPage: null,
      extensions: null,
      extensionPage: null,
      reclaim: null,
      deletionLog: null,
    }));
    const focus = get().focusedNodeId;
    if (focus) {
      try {
        await loadGraph(set, get, focus);
      } catch (error) {
        set({ toast: errorMessage(error) });
      }
      if (focus !== before) {
        try {
          await refreshList(set, get, focus, get().query);
          await watchPath(watchFocused(get, focus));
        } catch (error) {
          set({ toast: errorMessage(error) });
        }
      }
    }
  } catch (error) {
    set({ toast: errorMessage(error), drainingId: null });
  } finally {
    trashLocks.delete(path);
  }
}

export function requestTrash(set: SetFile, get: GetFile, path: string): void {
  if (get().recyclePrompt) return;
  if (!canDestroy(get(), path)) return;
  const node = nodeByPath(get().nodes, path);
  const name = node?.name || pathTail(path);
  const sizeBytes = node?.sizeBytes ?? 0;
  const items = singlePreview(path, name, sizeBytes);
  set({
    recyclePrompt: {
      kind: "path",
      path,
      title: "Move to the Recycle Bin?",
      items,
      totalCount: 1,
      totalBytes: sizeBytes,
      note: "You can restore it from the Recycle Bin or the Deleted tab.",
    },
  });
}

export function beginTrash(set: SetFile, get: GetFile, path: string): void {
  if (!canDestroy(get(), path)) return;
  if (inGraph(get().graphView, path)) {
    set({ drainingId: path });
    return;
  }
  void commit(set, get, path, "trash");
}

export function finishDrain(set: SetFile, get: GetFile, path: string): void {
  if (get().drainingId !== path) return;
  void commit(set, get, path, "trash");
}

export function requestPermanentDelete(set: SetFile, get: GetFile, path: string): void {
  if (!canDestroy(get(), path)) return;
  const node = nodeByPath(get().nodes, path);
  const name = node?.name || pathTail(path);
  const sizeBytes = node?.sizeBytes ?? 0;
  const items = singlePreview(path, name, sizeBytes);
  set({
    permanentPrompt: {
      path,
      title: "Permanently delete?",
      items,
      totalCount: 1,
      totalBytes: sizeBytes,
      note: "This skips the Recycle Bin. Prefer Delete (or Move to Recycle Bin) unless you are sure.",
    },
  });
}

export async function confirmPermanentDelete(set: SetFile, get: GetFile): Promise<void> {
  const prompt = get().permanentPrompt;
  if (!prompt || !canDestroy(get(), prompt.path)) {
    set({ permanentPrompt: null });
    return;
  }
  set({ permanentPrompt: null });
  await commit(set, get, prompt.path, "permanent");
}

export async function reveal(path: string, set: SetFile): Promise<void> {
  try {
    await revealInExplorer(path);
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function copyNodePath(path: string, set: SetFile): Promise<void> {
  try {
    await copyPath(path);
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}
