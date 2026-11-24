import { categoryTextClass, nodeGlyph } from "../../lib/colors";
import { formatBytes } from "../../lib/format";
import type { GrowthEntry } from "../../types/filesystem";
import { deltaShare, growthNode, parentFolderLabel } from "./growthSort";

interface GrowthRowProps {
  entry: GrowthEntry;
  maxDelta: number;
  selected: boolean;
  onOpen: (entry: GrowthEntry) => void;
}

export function GrowthRow({ entry, maxDelta, selected, onOpen }: GrowthRowProps) {
  const node = growthNode(entry);
  const kindLabel = entry.kind === "folder" ? "Folder" : "File";
  const isNew = entry.previousBytes === 0;
  return (
    <button
      type="button"
      title={entry.path}
      aria-selected={selected}
      className={`flex h-[52px] w-full items-center gap-2 overflow-hidden px-2 text-left text-sm select-none ${selected ? "bg-cyan-400/15" : "hover:bg-white/5"}`}
      onClick={() => onOpen(entry)}
    >
      <span className="w-4 shrink-0 text-center" style={{ color: categoryTextClass(node) }} aria-hidden="true">
        {nodeGlyph(node)}
      </span>
      <span className="sr-only">{kindLabel}</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{entry.name}</span>
          {isNew ? <span className="shrink-0 rounded-full bg-emerald-400/15 px-1.5 text-[10px] leading-4 text-emerald-200">New</span> : null}
        </span>
        <span className="block truncate text-xs text-slate-500">{parentFolderLabel(entry.path)}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="flex items-center gap-2">
          <span className="h-1 w-12 overflow-hidden rounded bg-white/10" aria-hidden="true">
            <span className="block h-full bg-cyan-300/80" style={{ width: deltaShare(entry.deltaBytes, maxDelta) }} />
          </span>
          <span className="w-16 text-right font-mono text-[11px] text-emerald-200 tabular-nums">+{formatBytes(entry.deltaBytes)}</span>
        </span>
        <span className="text-[10px] whitespace-nowrap text-slate-500 tabular-nums">
          {formatBytes(entry.sizeBytes)} · was {formatBytes(entry.previousBytes)}
        </span>
      </span>
    </button>
  );
}
