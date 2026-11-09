import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ChildrenPage, DeleteResult, DriveInfo, GraphView, ScanProgress } from "../types/filesystem";

/** The only module that imports @tauri-apps/api. */
export function listDrives(): Promise<DriveInfo[]> {
  return invoke<DriveInfo[]>("list_drives");
}

export function startScan(path: string, onProgress: (progress: ScanProgress) => void): Promise<ScanProgress> {
  const channel = new Channel<ScanProgress>();
  channel.onmessage = onProgress;
  return invoke<ScanProgress>("start_scan", { path, onProgress: channel });
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
