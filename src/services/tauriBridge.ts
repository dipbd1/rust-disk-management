import { Channel } from "@tauri-apps/api/core";
import { invoke } from "tauri-remote-ui/api/core";
import { listen } from "tauri-remote-ui/api/event";
import type {
  BinEmptyResult,
  ChildrenPage,
  DeleteResult,
  DeletionLogEntry,
  DriveInfo,
  DuplicateProgress,
  ElevationStatus,
  ExtensionRollup,
  GraphView,
  GrowthDelta,
  InsightPage,
  LargestSort,
  ReclaimProgress,
  ReclaimReport,
  ReclaimScanResult,
  RecycleBatch,
  RestoreResult,
  ScanProgress,
} from "../types/filesystem";

/** The only module that imports Tauri IPC. `Channel` stays on `@tauri-apps/api`; `invoke` and `listen` use the remote-ui shim so a browser can reach the running app. */
export function listDrives(): Promise<DriveInfo[]> {
  return invoke<DriveInfo[]>("list_drives");
}

function inDesktopWebview(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function gate<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  once: (apply: () => void) => void;
} {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  let settled = false;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: (value) => resolve(value),
    reject: (error) => reject(error),
    once(apply) {
      if (settled) return;
      settled = true;
      apply();
    },
  };
}

export async function startScan(
  path: string,
  onProgress: (progress: ScanProgress) => void,
  force = false,
): Promise<ScanProgress> {
  if (inDesktopWebview()) {
    const channel = new Channel<ScanProgress>();
    channel.onmessage = onProgress;
    return invoke<ScanProgress>("start_scan", { path, onProgress: channel });
  }
  // The socket invoke times out at 30s. The walk itself finishes on `scan-progress` with `done`.
  return awaitBrowserScan(path, onProgress, force);
}

function awaitBrowserScan(
  path: string,
  onProgress: (progress: ScanProgress) => void,
  force: boolean,
): Promise<ScanProgress> {
  const done = gate<ScanProgress>();
  return (async () => {
    const stopProgress = await listen<ScanProgress>("scan-progress", (event) => {
      onProgress(event.payload);
      if (event.payload.done) done.once(() => done.resolve(event.payload));
    });
    const stopError = await listen<string>("scan-error", (event) => {
      done.once(() => done.reject(new Error(event.payload)));
    });
    try {
      await invoke("start_scan_remote", { path, force });
      return await done.promise;
    } finally {
      stopProgress();
      stopError();
    }
  })();
}

export function cancelScan(): Promise<void> {
  return invoke("cancel_scan");
}

export function getChildren(
  path: string,
  offset: number,
  limit: number,
  query: string | null,
): Promise<ChildrenPage> {
  return invoke<ChildrenPage>("get_children", { path, offset, limit, query });
}

export function getGraphView(path: string): Promise<GraphView> {
  return invoke<GraphView>("get_graph_view", { path });
}

export function trashPath(path: string): Promise<DeleteResult> {
  return invoke<DeleteResult>("trash_path", { path });
}

export function permanentDelete(path: string): Promise<DeleteResult> {
  return invoke<DeleteResult>("permanent_delete", { path });
}

export function recentDeletions(): Promise<DeletionLogEntry[]> {
  return invoke<DeletionLogEntry[]>("recent_deletions");
}

export function restoreDeleted(path: string): Promise<RestoreResult> {
  return invoke<RestoreResult>("restore_deleted", { path });
}

export function openRecycleBin(): Promise<void> {
  return invoke("open_recycle_bin");
}

export function revealInExplorer(path: string): Promise<void> {
  return invoke("reveal_in_explorer", { path });
}

export function copyPath(path: string): Promise<void> {
  return invoke("copy_path", { path });
}

export function watchPath(path: string): Promise<void> {
  return invoke("watch_path", { path });
}

export function onFsStale(handler: (path: string) => void): Promise<() => void> {
  return listen<string>("fs-stale", (event) => {
    handler(event.payload);
  });
}

export function elevationStatus(): Promise<ElevationStatus> {
  return invoke<ElevationStatus>("elevation_status");
}

/** `true` when Windows accepted the elevated launch and this process is exiting. */
export function relaunchElevated(): Promise<boolean> {
  return invoke<boolean>("relaunch_elevated");
}

export function largestFiles(offset: number, limit: number, sort: LargestSort, descending: boolean): Promise<InsightPage> {
  return invoke<InsightPage>("largest_files", { offset, limit, sort, descending });
}

export function searchIndex(query: string, offset: number, limit: number): Promise<InsightPage> {
  return invoke<InsightPage>("search_index", { query, offset, limit });
}

export function extensionRollup(): Promise<ExtensionRollup> {
  return invoke<ExtensionRollup>("extension_rollup");
}

export function extensionFiles(extension: string, other: boolean, offset: number, limit: number): Promise<InsightPage> {
  return invoke<InsightPage>("extension_files", { extension, other, offset, limit });
}

export function reclaimReport(onProgress: (progress: ReclaimProgress) => void): Promise<ReclaimScanResult> {
  if (inDesktopWebview()) {
    const channel = new Channel<ReclaimProgress>();
    channel.onmessage = onProgress;
    return invoke<ReclaimScanResult>("reclaim_report", { onProgress: channel });
  }
  return awaitBrowserReclaim(onProgress);
}

export function cancelReclaim(): Promise<void> {
  return invoke("cancel_reclaim");
}

function awaitBrowserReclaim(onProgress: (progress: ReclaimProgress) => void): Promise<ReclaimScanResult> {
  const done = gate<ReclaimScanResult>();
  return (async () => {
    const stopProgress = await listen<ReclaimProgress>("reclaim-progress", (event) => {
      onProgress(event.payload);
      if (event.payload.done && event.payload.cancelled) done.once(() => done.resolve({ cancelled: true, report: null }));
    });
    const stopReport = await listen<ReclaimReport>("reclaim-report", (event) => {
      done.once(() => done.resolve({ cancelled: false, report: event.payload }));
    });
    const stopError = await listen<string>("reclaim-error", (event) => {
      done.once(() => done.reject(new Error(event.payload)));
    });
    try {
      await invoke("reclaim_report_remote");
      return await done.promise;
    } finally {
      stopProgress();
      stopReport();
      stopError();
    }
  })();
}

export function recycleReclaim(ids: string[]): Promise<RecycleBatch> {
  return invoke<RecycleBatch>("recycle_reclaim", { ids });
}

export function emptyRecycleBin(): Promise<BinEmptyResult> {
  return invoke<BinEmptyResult>("empty_recycle_bin");
}

export function growthDelta(): Promise<GrowthDelta> {
  return invoke<GrowthDelta>("growth_delta");
}

export function pickScanFolder(): Promise<string | null> {
  return invoke<string | null>("pick_scan_folder");
}

export function cancelDuplicateReview(): Promise<void> {
  return invoke("cancel_duplicate_review");
}

export function recycleDuplicateCopies(paths: string[]): Promise<RecycleBatch> {
  return invoke<RecycleBatch>("recycle_duplicate_copies", { paths });
}

export async function startDuplicateReview(onProgress: (progress: DuplicateProgress) => void): Promise<DuplicateProgress> {
  if (inDesktopWebview()) {
    const channel = new Channel<DuplicateProgress>();
    channel.onmessage = onProgress;
    return invoke<DuplicateProgress>("start_duplicate_review", { onProgress: channel });
  }
  return awaitBrowserDuplicates(onProgress);
}

function awaitBrowserDuplicates(onProgress: (progress: DuplicateProgress) => void): Promise<DuplicateProgress> {
  const done = gate<DuplicateProgress>();
  return (async () => {
    const stopProgress = await listen<DuplicateProgress>("duplicate-progress", (event) => {
      onProgress(event.payload);
      if (event.payload.done) done.once(() => done.resolve(event.payload));
    });
    const stopError = await listen<string>("duplicate-error", (event) => {
      done.once(() => done.reject(new Error(event.payload)));
    });
    try {
      await invoke("start_duplicate_review_remote");
      return await done.promise;
    } finally {
      stopProgress();
      stopError();
    }
  })();
}
