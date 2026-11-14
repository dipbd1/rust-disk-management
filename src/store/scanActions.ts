import { CHILD_PAGE_SIZE } from "../lib/limits";
import { diskUsedRatio, errorMessage } from "../lib/format";
import { cancelScan, elevationStatus, getChildren, growthDelta, listDrives, onFsStale, relaunchElevated, startScan, watchPath } from "../services/tauriBridge";
import { applyIndexPage, applyPreview, placeholderNode } from "./cache";
import { loadGraph, refreshList, watchFocused } from "./navActions";
import { session } from "./session";
import type { FileStore } from "./types";
import type { StoreApi } from "zustand";

type SetFile = StoreApi<FileStore>["setState"];
type GetFile = StoreApi<FileStore>["getState"];

const ELEVATION_DISMISS_KEY = "lsm.skip-elevation-prompt";

function elevationDismissed(): boolean {
  try {
    return localStorage.getItem(ELEVATION_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export async function boot(set: SetFile, get: GetFile): Promise<void> {
  if (session.booted) return;
  session.booted = true;
  try {
    session.stopStale = await onFsStale((path) => {
      set({ stale: true, stalePath: path });
    });
    const drives = await listDrives();
    set({ drives });
    let elevated = false;
    let ntfsPresent = false;
    try {
      const status = await elevationStatus();
      elevated = status.elevated;
      ntfsPresent = status.ntfsPresent;
    } catch (error) {
      set({ toast: errorMessage(error) });
    }
    set({ elevated });
    const fixed = drives.find((drive) => !drive.isRemovable);
    if (!fixed) return;
    if (!elevated && ntfsPresent && !elevationDismissed()) {
      set({ elevationPrompt: true, pendingMount: fixed.mount });
      return;
    }
    await scanDrive(set, get, fixed.mount, false);
  } catch (error) {
    set({ toast: errorMessage(error), scanStatus: "error" });
  }
}

export async function continueWithoutElevation(set: SetFile, get: GetFile, remember: boolean): Promise<void> {
  if (remember) {
    try {
      localStorage.setItem(ELEVATION_DISMISS_KEY, "1");
    } catch {
      // The scan still runs if storage is blocked.
    }
  }
  const mount = get().pendingMount ?? get().drives.find((drive) => !drive.isRemovable)?.mount ?? null;
  set({ elevationPrompt: false });
  if (mount && get().scanStatus !== "scanning") {
    await scanDrive(set, get, mount, false);
  }
}

export async function restartElevated(set: SetFile, get: GetFile): Promise<void> {
  try {
    const started = await relaunchElevated();
    if (!started && get().elevationPrompt) {
      await continueWithoutElevation(set, get, false);
    }
  } catch (error) {
    set({ toast: errorMessage(error) });
    if (get().elevationPrompt) {
      await continueWithoutElevation(set, get, false);
    }
  }
}

export async function scanDrive(set: SetFile, get: GetFile, mount: string, force = true): Promise<void> {
  const token = ++session.scan;
  session.preview = token;
  const drive = get().drives.find((item) => item.mount === mount);
  const used = drive ? diskUsedRatio(drive) * drive.totalBytes : 0;
  const folderName = mount.replace(/\\$/, "").split("\\").pop() || mount;
  const root = placeholderNode(mount, drive?.label || folderName, used);
  set({
    activeDrive: mount,
    rootId: mount,
    scanStatus: "scanning",
    stale: false,
    stalePath: null,
    progress: null,
    nodes: { [root.id]: root },
    childPages: {},
    list: null,
    graphView: null,
    focusedNodeId: mount,
    selectedNodeId: mount,
    expandedIds: [mount],
    drainingId: null,
    confirmPath: null,
    query: "",
    largestPage: null,
    searchPage: null,
    extensions: null,
    extensionTarget: null,
    extensionPage: null,
    reclaim: null,
    duplicateRun: null,
    growth: null,
    recyclePrompt: null,
  });
  try {
    const finalProgress = await startScan(
      mount,
      (progress) => {
        if (token !== session.scan || session.preview !== token) return;
        set((state) => applyPreview(state, progress));
      },
      force,
    );
    if (token !== session.scan) return;
    session.preview = -1;
    set((state) => applyPreview(state, finalProgress));
    await settleScan(set, get, token, finalProgress.cancelled);
  } catch (error) {
    if (token !== session.scan) return;
    set({ scanStatus: "error", toast: errorMessage(error) });
  }
}

async function settleScan(set: SetFile, get: GetFile, token: number, cancelled: boolean): Promise<void> {
  const focus = get().focusedNodeId ?? get().activeDrive;
  const rootId = get().rootId;
  const root = (rootId ? get().nodes[rootId]?.path : undefined) ?? get().activeDrive;
  if (!root || !focus) {
    set({ scanStatus: cancelled ? "cancelled" : "ready" });
    return;
  }
  const page = await getChildren(root, 0, CHILD_PAGE_SIZE, null);
  if (token !== session.scan) return;
  set((state) => ({
    ...applyIndexPage(state, page, false),
    scanStatus: cancelled ? "cancelled" : "ready",
  }));
  try {
    await loadGraph(set, get, focus);
  } catch (error) {
    if (token !== session.scan) return;
    set({ toast: errorMessage(error) });
  }
  try {
    await refreshList(set, get, focus, get().query);
  } catch (error) {
    if (token !== session.scan) return;
    set({ toast: errorMessage(error) });
  }
  try {
    await watchPath(watchFocused(get, focus));
  } catch (error) {
    if (token !== session.scan) return;
    set({ toast: errorMessage(error) });
  }
  if (cancelled || token !== session.scan) return;
  try {
    const growth = await growthDelta();
    if (token !== session.scan) return;
    set({ growth });
  } catch (error) {
    if (token !== session.scan) return;
    set({ toast: errorMessage(error) });
  }
}

export async function cancelActiveScan(): Promise<void> {
  await cancelScan();
}

export async function rescan(set: SetFile, get: GetFile): Promise<void> {
  const mount = get().activeDrive;
  if (!mount) return;
  await scanDrive(set, get, mount);
}
