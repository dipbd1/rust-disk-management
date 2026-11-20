import { formatBytes } from "./format";
import type { ReclaimGroupTick, ReclaimProgress } from "../types/filesystem";

const LOOKUPS = [
  { id: "temp", title: "Temporary files" },
  { id: "browser", title: "Browser caches" },
  { id: "thumbnail", title: "Thumbnail cache" },
  { id: "build", title: "Build caches" },
  { id: "review", title: "Downloads and previous Windows" },
  { id: "system", title: "System files" },
  { id: "bin", title: "Recycle Bin" },
] as const;

export const RECLAIM_LOOKUPS = LOOKUPS.map((group) => group.title);

/** Shown until the first progress tick arrives. */
export function idleReclaimProgress(): ReclaimProgress {
  return {
    checked: 0,
    total: 0,
    currentPath: "",
    phase: "index",
    groups: LOOKUPS.map((group) => ({
      id: group.id,
      title: group.title,
      sizeBytes: 0,
      status: group.id === "bin" ? "pending" : "scanning",
    })),
    done: false,
    cancelled: false,
  };
}

export function scannedPercent(progress: ReclaimProgress): number {
  if (progress.phase === "bin") return 100;
  if (progress.total <= 0) return 0;
  return Math.min(100, Math.round((progress.checked / progress.total) * 100));
}

export function reclaimGroupLabel(group: ReclaimGroupTick): string {
  if (group.status === "pending") return "Pending";
  if (group.status === "scanning") {
    return group.sizeBytes > 0 ? `${formatBytes(group.sizeBytes)} · Scanning…` : "Scanning…";
  }
  return formatBytes(group.sizeBytes);
}
