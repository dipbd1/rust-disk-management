import type { FileNode } from "../types/filesystem";
import { getNodeVisualTheme } from "./nodeColors";

export interface LiquidColor {
  a: string;
  b: string;
}

export function liquidColors(node: FileNode): LiquidColor {
  const theme = getNodeVisualTheme(node);
  return { a: theme.primary, b: theme.secondary };
}

export function categoryTextClass(node: FileNode): string {
  const theme = getNodeVisualTheme(node);
  return theme.badgeText;
}

export function nodeGlyph(node: FileNode): string {
  if (node.kind === "folder") return "▣";
  if (node.kind === "aggregate") return "◌";
  const theme = getNodeVisualTheme(node);
  return theme.icon || "▤";
}
