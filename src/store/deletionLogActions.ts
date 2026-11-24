import { errorMessage } from "../lib/format";
import { openRecycleBin, recentDeletions, restoreDeleted } from "../services/tauriBridge";
import type { FileStore } from "./types";
import type { StoreApi } from "zustand";

type SetFile = StoreApi<FileStore>["setState"];

export async function loadDeletionLog(set: SetFile): Promise<void> {
  try {
    const entries = await recentDeletions();
    set({ deletionLog: entries });
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function restoreDeletion(set: SetFile, path: string): Promise<void> {
  try {
    const result = await restoreDeleted(path);
    set({ toast: result.message });
    if (result.restored) {
      const entries = await recentDeletions();
      set({ deletionLog: entries });
    }
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}

export async function openRecycleBinFolder(set: SetFile): Promise<void> {
  try {
    await openRecycleBin();
  } catch (error) {
    set({ toast: errorMessage(error) });
  }
}
