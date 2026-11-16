import { formatBytes } from "./format";
import { ancestorChain, toWindowsPath } from "./paths";
import type { ReclaimReport, ReclaimRow, ReclaimTier } from "../types/filesystem";

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

export function listedNames(titles: string[]): string {
  const shown = titles.slice(0, 8);
  const extra = titles.length - shown.length;
  const lines = shown.join("\n");
  if (extra <= 0) return lines;
  return `${lines}\nand ${extra} more.`;
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

export function groupPrompt(kind: "safe" | "rebuild", rows: ReclaimRow[]): { title: string; body: string; outcome: string } {
  const bytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
  const count = rows.reduce((sum, row) => sum + row.itemCount, 0);
  const labels =
    kind === "rebuild"
      ? rows.map((row) => `${row.title} — ${parentFolder(row.revealPath)}`)
      : rows.map((row) => row.title);
  const names = listedNames(labels);
  const countLine = `Move ${count.toLocaleString()} items (${formatBytes(bytes)}) to the Recycle Bin.`;
  if (kind === "safe") {
    return {
      title: "Move scratch files to the Recycle Bin?",
      body: `${names}\n\n${countLine} Windows and browsers recreate these. You can restore them from the bin.`,
      outcome: COMES_BACK_TOAST,
    };
  }
  return {
    title: "Move build caches to the Recycle Bin?",
    body: `${names}\n\n${countLine} The next install or build downloads them again. You can restore them from the bin.`,
    outcome: COMES_BACK_TOAST,
  };
}

function tierBytes(rows: ReclaimRow[], tier: ReclaimTier): number {
  return rows.filter((row) => row.tier === tier).reduce((sum, row) => sum + row.sizeBytes, 0);
}
