import { formatBytes } from "./format";
import type { DeletePreviewItem } from "../types/filesystem";

export function pathTail(path: string): string {
  const slash = path.replace(/[\\/]+$/, "");
  const cut = Math.max(slash.lastIndexOf("\\"), slash.lastIndexOf("/"));
  return (cut >= 0 ? slash.slice(cut + 1) : slash) || path;
}

export function previewTotals(items: DeletePreviewItem[]): { totalCount: number; totalBytes: number } {
  return {
    totalCount: items.length,
    totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
  };
}

export function singlePreview(path: string, name: string, sizeBytes: number): DeletePreviewItem[] {
  return [{ path, name: name || pathTail(path), sizeBytes }];
}

export function summaryLine(count: number, bytes: number): string {
  const items = count === 1 ? "1 item" : `${count.toLocaleString()} items`;
  return `${items} · ${formatBytes(bytes)}`;
}
