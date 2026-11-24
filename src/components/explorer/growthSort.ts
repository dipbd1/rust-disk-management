import { formatBytes } from "../../lib/format";
import { toWindowsPath } from "../../lib/paths";
import type { FileNode, GrowthEntry } from "../../types/filesystem";

export type GrowthSort = "growth" | "size" | "kind";

export interface GrowthOrder {
  sort: GrowthSort;
  descending: boolean;
}

export type GrowthListRow =
  | { type: "header"; id: string; label: string; count: number }
  | { type: "entry"; entry: GrowthEntry };

export function parentFolderLabel(path: string): string {
  const slash = toWindowsPath(path);
  const idx = slash.lastIndexOf("\\");
  if (idx < 0) return slash;
  if (idx === 2 && slash.charCodeAt(1) === 58) return slash.slice(0, idx + 1);
  if (idx === 0) return slash;
  return slash.slice(0, idx);
}

export function growthNode(entry: GrowthEntry): FileNode {
  return {
    id: entry.path,
    name: entry.name,
    path: entry.path,
    parentId: null,
    kind: entry.kind,
    category: entry.kind === "folder" ? "folder" : "other",
    sizeBytes: entry.sizeBytes,
    childCount: 0,
    percentOfParent: 0,
  };
}

export function deltaShare(delta: number, maxDelta: number): string {
  if (maxDelta <= 0 || delta <= 0) return "0%";
  return `${Math.min(100, (delta / maxDelta) * 100)}%`;
}

export function signedBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes === 0) return formatBytes(0);
  const sign = bytes > 0 ? "+" : "\u2212";
  return `${sign}${formatBytes(Math.abs(bytes))}`;
}

function cmpNum(a: number, b: number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function isFolder(entry: GrowthEntry): boolean {
  return entry.kind === "folder";
}

function compareGrowth(a: GrowthEntry, b: GrowthEntry, order: GrowthOrder): number {
  if (order.sort === "kind") {
    const foldersFirst = order.descending ? (isFolder(a) ? 0 : 1) - (isFolder(b) ? 0 : 1) : (isFolder(b) ? 0 : 1) - (isFolder(a) ? 0 : 1);
    if (foldersFirst !== 0) return foldersFirst;
  } else {
    const value = order.sort === "size" ? cmpNum(a.sizeBytes, b.sizeBytes) : cmpNum(a.deltaBytes, b.deltaBytes);
    const directed = order.descending ? -value : value;
    if (directed !== 0) return directed;
  }
  const delta = cmpNum(b.deltaBytes, a.deltaBytes);
  if (delta !== 0) return delta;
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

export function buildGrowthRows(entries: readonly GrowthEntry[], order: GrowthOrder): GrowthListRow[] {
  const sorted = [...entries].sort((a, b) => compareGrowth(a, b, order));
  if (order.sort !== "kind") return sorted.map((entry) => ({ type: "entry", entry }));
  let folders = 0;
  let files = 0;
  for (const entry of sorted) {
    if (isFolder(entry)) folders += 1;
    else files += 1;
  }
  const rows: GrowthListRow[] = [];
  let current: "folder" | "file" | null = null;
  for (const entry of sorted) {
    const kind = isFolder(entry) ? "folder" : "file";
    if (kind !== current) {
      current = kind;
      rows.push({
        type: "header",
        id: kind,
        label: kind === "folder" ? "Folders" : "Files",
        count: kind === "folder" ? folders : files,
      });
    }
    rows.push({ type: "entry", entry });
  }
  return rows;
}
