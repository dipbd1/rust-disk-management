import { CHILD_PAGE_SIZE } from "../lib/limits";
import { diskUsedRatio, errorMessage } from "../lib/format";
import { cancelScan, getChildren, listDrives, onFsStale, startScan, watchPath } from "../services/tauriBridge";
import { applyIndexPage, applyPreview, placeholderNode } from "./cache";
import { loadGraph, refreshList } from "./navActions";
import { session } from "./session";
import type { FileStore } from "./types";
import type { StoreApi } from "zustand";

type SetFile = StoreApi<FileStore>["setState"];
type GetFile = StoreApi<FileStore>["getState"];

export async function boot(set: SetFile, get: GetFile): Promise<void> {
  if (session.booted) return;
  session.booted = true;
  try {
    session.stopStale = await onFsStale((path) => {
      set({ stale: true, stalePath: path });
    });
    const drives = await listDrives();
    set({ drives });
    const fixed = drives.find((drive) => !drive.isRemovable);
    if (fixed) await scanDrive(set, get, fixed.mount, false);
  } catch (error) {
    set({ toast: errorMessage(error), scanStatus: "error" });
  }
}

export async function scanDrive(set: SetFile, get: GetFile, mount: string, force = true): Promise<void> {
  const token = ++session.scan;
  session.preview = token;
  const drive = get().drives.find((item) => item.mount === mount);
  const used = drive ? diskUsedRatio(drive) * drive.totalBytes : 0;
  const root = placeholderNode(mount, drive?.label ?? "", used);
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
    await watchPath(focus);
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
