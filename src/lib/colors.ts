import type { FileNode } from "../types/filesystem";
import { HEAVY_FILE_BYTES } from "./limits";

export interface LiquidColor {
  a: string;
  b: string;
}

const COLORS: Record<FileNode["category"], LiquidColor> = {
  folder: { a: "#00F0FF", b: "#0066FF" },
  media: { a: "#FF007A", b: "#7928CA" },
  code: { a: "#00FF87", b: "#00B4DB" },
  heavy: { a: "#FFC837", b: "#FF8008" },
  other: { a: "#94A3B8", b: "#475569" },
};

export function liquidColors(node: FileNode): LiquidColor {
  if (node.kind === "file" && node.sizeBytes >= HEAVY_FILE_BYTES) return COLORS.heavy;
  return COLORS[node.category];
}

export function categoryTextClass(node: FileNode): string {
  const category = node.kind === "file" && node.sizeBytes >= HEAVY_FILE_BYTES ? "heavy" : node.category;
  switch (category) {
    case "folder":
      return "text-cyan-300";
    case "media":
      return "text-pink-400";
    case "code":
      return "text-emerald-300";
    case "heavy":
      return "text-amber-400";
    default:
      return "text-slate-400";
  }
}

export function nodeGlyph(node: FileNode): string {
  if (node.kind === "folder") return "▣";
  if (node.kind === "aggregate") return "◌";
  return "▤";
}
