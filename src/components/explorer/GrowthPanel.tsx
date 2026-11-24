import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes } from "../../lib/format";
import { useFileStore } from "../../store/useFileStore";

const ROW_HEIGHT = 40;

export function GrowthPanel() {
  const growth = useFileStore((state) => state.growth);
  const scanStatus = useFileStore((state) => state.scanStatus);
  const selectedNodeId = useFileStore((state) => state.selectedNodeId);
  const openGrowth = useFileStore((state) => state.openGrowth);
  const parentRef = useRef<HTMLDivElement>(null);
  const entries = growth?.entries ?? [];
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  if (scanStatus === "scanning") return <p className="px-3 py-4 text-sm text-slate-500">Growth appears when this scan finishes.</p>;
  if (!growth || !growth.hasBaseline) {
    return <p className="px-3 py-4 text-sm text-slate-500">Scan this same place again to see which folders grew and which large files are new or bigger.</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-3 py-2 text-xs text-slate-400">
        {formatBytes(growth.totalBytes)} now · was {formatBytes(growth.previousTotal)}
      </p>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        {entries.length === 0 ? (
          <p className="px-3 text-sm text-slate-500">Nothing grew in the saved snapshot.</p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const entry = entries[item.index];
              if (!entry) return null;
              const selected = selectedNodeId === entry.path;
              return (
                <button
                  key={entry.path}
                  type="button"
                  title={entry.path}
                  aria-selected={selected}
                  className={`absolute top-0 left-0 flex h-10 w-full items-center gap-2 px-3 text-left ${selected ? "bg-cyan-400/15" : "hover:bg-white/5"}`}
                  style={{ transform: `translateY(${item.start}px)` }}
                  onClick={() => void openGrowth(entry)}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-emerald-200">+{formatBytes(entry.deltaBytes)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
