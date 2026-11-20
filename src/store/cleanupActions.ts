import { formatBytes, errorMessage } from "../lib/format";
import {
  cancelDuplicateReview,
  cancelReclaim as requestCancelReclaim,
  emptyRecycleBin,
  reclaimReport,
  recycleDuplicateCopies,
  recycleReclaim,
  startDuplicateReview,
} from "../services/tauriBridge";
import type { DuplicateProgress, RecycleBatch } from "../types/filesystem";
import { applyDelete } from "./cache";
import { beginTrash } from "./deleteActions";
import type { FileStore, RecyclePrompt } from "./types";
import type { StoreApi } from "zustand";

type SetFile = StoreApi<FileStore>["setState"];
type GetFile = StoreApi<FileStore>["getState"];

let reclaimToken = 0;

export async function loadReclaim(set: SetFile, get: GetFile): Promise<void> {
  if (get().reclaimBusy) return;
  const token = ++reclaimToken;
  set({ reclaimBusy: true, reclaimProgress: null });
  try {
    const result = await reclaimReport((progress) => {
      if (token !== reclaimToken || !get().reclaimBusy) return;
      set({ reclaimProgress: progress });
    });
    if (token !== reclaimToken || !get().reclaimBusy || !result.report) return;
    set({ reclaim: result.report });
  } catch (error) {
    if (token === reclaimToken) set({ toast: errorMessage(error) });
  } finally {
    if (token === reclaimToken) set({ reclaimBusy: false, reclaimProgress: null });
  }
}

export async function cancelReclaim(set: SetFile): Promise<void> {
  try {
    await requestCancelReclaim();
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function startDuplicates(set: SetFile, get: GetFile): Promise<void> {
  if (get().duplicateRun?.running || get().scanStatus === "scanning") return;
  set({
    duplicateRun: {
      running: true,
      checked: 0,
      total: 0,
      currentPath: "",
      done: false,
      cancelled: false,
      truncated: false,
      groups: [],
    },
  });
  try {
    const finalProgress = await startDuplicateReview((progress) => {
      set({ duplicateRun: { ...progress, running: !progress.done } });
    });
    set({ duplicateRun: { ...finalProgress, running: false } });
  } catch (error) {
    set({ duplicateRun: null, toast: errorMessage(error) });
  }
}

export async function cancelDuplicates(set: SetFile): Promise<void> {
  try {
    await cancelDuplicateReview();
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export function promptRecycle(set: SetFile, prompt: RecyclePrompt): void {
  set({ recyclePrompt: prompt });
}

export function dismissRecycle(set: SetFile): void {
  set({ recyclePrompt: null });
}

export async function confirmRecycle(set: SetFile, get: GetFile): Promise<void> {
  const prompt = get().recyclePrompt;
  if (!prompt) return;
  set({ recyclePrompt: null });
  try {
    if (prompt.kind === "reclaim") {
      applyBatch(set, await recycleReclaim(prompt.ids), prompt.outcome);
      await loadReclaim(set, get);
      return;
    }
    if (prompt.kind === "duplicates") {
      applyBatch(set, await recycleDuplicateCopies(prompt.paths));
      set({ duplicateRun: null });
      return;
    }
    if (prompt.kind === "path") {
      beginTrash(set, get, prompt.path);
      return;
    }
    const emptied = await emptyRecycleBin();
    set({ toast: prompt.outcome ?? `Emptied the Recycle Bin · ${formatBytes(emptied.freedBytes)} freed` });
    await loadReclaim(set, get);
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

function applyBatch(set: SetFile, batch: RecycleBatch, outcome?: string): void {
  set((state) => {
    const next = batch.results.reduce((acc, result) => ({ ...acc, ...applyDelete(acc, result) }), state);
    return {
      ...next,
      largestPage: null,
      searchPage: null,
      extensions: null,
      extensionPage: null,
      reclaim: null,
      toast: outcome ?? `Moved to the Recycle Bin · ${formatBytes(batch.freedBytes)} freed`,
    };
  });
}

export function duplicateLabel(progress: DuplicateProgress): string {
  const total = progress.total > 0 ? ` / ${progress.total.toLocaleString()}` : "";
  return `${progress.checked.toLocaleString()}${total}`;
}
