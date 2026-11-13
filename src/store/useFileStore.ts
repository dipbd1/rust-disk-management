import { create } from "zustand";
import { errorMessage } from "../lib/format";
import {
  confirmPermanentDelete,
  copyNodePath,
  finishDrain,
  requestPermanentDelete,
  requestTrash,
  reveal,
} from "./deleteActions";
import { focusNode, loadMoreList, loadMoreTree, setQuery, toggleExpanded } from "./navActions";
import {
  cancelDuplicates,
  confirmRecycle,
  dismissRecycle,
  loadReclaim,
  promptRecycle,
  startDuplicates,
} from "./cleanupActions";
import {
  loadExtensions,
  loadGrowth,
  loadLargest,
  loadMoreExtension,
  loadMoreLargest,
  loadMoreSearch,
  openExtension,
  openLocated,
  scanFolder,
  searchWhole,
} from "./insightActions";
import { boot, cancelActiveScan, continueWithoutElevation, rescan, restartElevated, scanDrive } from "./scanActions";
import { initialData, type FileStore } from "./types";

export const useFileStore = create<FileStore>((set, get) => ({
  ...initialData,
  boot: () => boot(set, get),
  scanDrive: (mount) => scanDrive(set, get, mount, true),
  cancelScan: async () => {
    try {
      await cancelActiveScan();
    } catch (error) {
      set({ toast: errorMessage(error) });
    }
  },
  rescan: () => rescan(set, get),
  setQuery: (query) => setQuery(set, get, query),
  selectNode: (id) => set({ selectedNodeId: id }),
  focusNode: (id) => focusNode(set, get, id),
  toggleExpanded: (id) => toggleExpanded(set, get, id),
  loadMoreTree: (parentPath) => loadMoreTree(set, get, parentPath),
  loadMoreList: () => loadMoreList(set, get),
  reveal: (path) => reveal(path, set),
  copyNodePath: (path) => copyNodePath(path, set),
  requestTrash: (path) => requestTrash(set, get, path),
  finishDrain: (path) => finishDrain(set, get, path),
  requestPermanentDelete: (path) => requestPermanentDelete(set, get, path),
  confirmPermanentDelete: () => confirmPermanentDelete(set, get),
  dismissConfirm: () => set({ confirmPath: null }),
  dismissToast: () => set({ toast: null }),
  continueWithoutElevation: (remember) => continueWithoutElevation(set, get, remember),
  restartElevated: () => restartElevated(set, get),
  setLeftTab: (tab) => set({ leftTab: tab }),
  loadLargest: () => loadLargest(set),
  loadMoreLargest: () => loadMoreLargest(set, get),
  searchWhole: (query) => searchWhole(set, query),
  loadMoreSearch: (query) => loadMoreSearch(set, get, query),
  loadExtensions: () => loadExtensions(set),
  openExtension: (target) => openExtension(set, target),
  loadMoreExtension: () => loadMoreExtension(set, get),
  openLocated: (node) => openLocated(set, get, node),
  loadReclaim: () => loadReclaim(set),
  loadGrowth: () => loadGrowth(set),
  scanFolder: () => scanFolder(set, get),
  startDuplicates: () => startDuplicates(set, get),
  cancelDuplicates: () => cancelDuplicates(set),
  promptRecycle: (prompt) => promptRecycle(set, prompt),
  confirmRecycle: () => confirmRecycle(set, get),
  dismissRecycle: () => dismissRecycle(set),
}));
