import { ancestorChain, toWindowsPath } from "./paths";
import { previewTotals } from "./deletePreview";
import type { DeletePreviewItem, ReclaimReport, ReclaimRow, ReclaimTier } from "../types/filesystem";

export const COMES_BACK_TOAST =
  "In the Recycle Bin. This space comes back the next time those tools need the files.";
export const STAYS_FREE_TOAST = "Emptied the Recycle Bin. This space stays free.";

export interface ReclaimFigures {
  comesBack: number;
  rebuilds: number;
  staysFree: number | null;
  review: number;
}

export function reclaimFigures(report: ReclaimReport): ReclaimFigures {
  return {
    comesBack: tierBytes(report.rows, "safe"),
    rebuilds: tierBytes(report.rows, "rebuild"),
    staysFree: report.recycleBin.available ? report.recycleBin.sizeBytes : null,
    review: tierBytes(report.rows, "review"),
  };
}

/** Wide layout is for a report that has reclaimable bytes or a known bin size. */
export function reclaimHasContent(report: ReclaimReport | null): boolean {
  if (!report) return false;
  if (report.rows.some((row) => row.sizeBytes > 0)) return true;
  return report.recycleBin.available && report.recycleBin.sizeBytes > 0;
}

export function rowsByTier(rows: ReclaimRow[], tier: ReclaimTier): ReclaimRow[] {
  return rows.filter((row) => row.tier === tier);
}

export function initialChecked(rows: ReclaimRow[]): Set<string> {
  return new Set(rows.filter((row) => row.tier === "safe" && row.canRecycle).map((row) => row.id));
}

export function parentFolder(path: string): string {
  const chain = ancestorChain(toWindowsPath(path));
  if (chain.length < 2) return toWindowsPath(path);
  return chain[chain.length - 2];
}

/** Files focus their parent folder so the graph shows the directory, not a single leaf. */
export function graphFolder(row: ReclaimRow): string {
  const path = toWindowsPath(row.revealPath);
  const chain = ancestorChain(path);
  const name = path.slice(path.lastIndexOf("\\") + 1);
  if (name.length > 0 && name === row.title && chain.length >= 2) return chain[chain.length - 2];
  return path;
}

export function isOldDownload(row: ReclaimRow): boolean {
  return row.tier === "review" && row.sentence.toLowerCase().includes("over 30 days");
}

export function rowPreviewItems(rows: ReclaimRow[]): DeletePreviewItem[] {
  return rows.map((row) => ({
    path: row.revealPath,
    name: row.title,
    sizeBytes: row.sizeBytes,
  }));
}

export function groupPrompt(
  kind: "safe" | "rebuild",
  rows: ReclaimRow[],
): {
  title: string;
  items: DeletePreviewItem[];
  totalCount: number;
  totalBytes: number;
  note: string;
  outcome: string;
} {
  const items = rowPreviewItems(rows);
  const bytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
  const count = rows.reduce((sum, row) => sum + row.itemCount, 0);
  const totals = previewTotals(items);
  if (kind === "safe") {
    return {
      title: "Move scratch files to the Recycle Bin?",
      items,
      totalCount: count || totals.totalCount,
      totalBytes: bytes || totals.totalBytes,
      note: "Windows and browsers recreate these. You can restore them from the bin.",
      outcome: COMES_BACK_TOAST,
    };
  }
  return {
    title: "Move build caches to the Recycle Bin?",
    items,
    totalCount: count || totals.totalCount,
    totalBytes: bytes || totals.totalBytes,
    note: "The next install or build downloads them again. You can restore them from the bin.",
    outcome: COMES_BACK_TOAST,
  };
}

function tierBytes(rows: ReclaimRow[], tier: ReclaimTier): number {
  return rows.filter((row) => row.tier === tier).reduce((sum, row) => sum + row.sizeBytes, 0);
}
