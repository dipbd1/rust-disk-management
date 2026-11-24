import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes } from "../../lib/format";
import { pathTail } from "../../lib/deletePreview";
import type { DeletionLogEntry, DeletionMethod } from "../../types/filesystem";
import { useFileStore } from "../../store/useFileStore";

const ROW_HEIGHT = 72;

export function DeletedPanel() {
  const entries = useFileStore((state) => state.deletionLog);
  const loadDeletionLog = useFileStore((state) => state.loadDeletionLog);
  const restoreDeletion = useFileStore((state) => state.restoreDeletion);
  const openRecycleBinFolder = useFileStore((state) => state.openRecycleBinFolder);
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = entries ?? [];
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  useEffect(() => {
    void loadDeletionLog();
  }, [loadDeletionLog]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="h-7 rounded-md border border-cyan-300/40 px-2 text-xs text-cyan-100"
          onClick={() => void loadDeletionLog()}
        >
          Refresh
        </button>
        <button
          type="button"
          className="h-7 rounded-md border border-white/10 px-2 text-xs text-slate-200"
          onClick={() => void openRecycleBinFolder()}
        >
          Open Recycle Bin
        </button>
      </div>
      <p className="px-3 pb-2 text-xs text-slate-500">
        Recent deletes from this app. Recycle Bin items can often be restored here; otherwise open the bin.
      </p>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <p className="px-3 py-2 text-sm text-slate-500">No deletions logged yet.</p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const entry = rows[item.index];
              if (!entry) return null;
              return (
                <div key={`${entry.unixMs}-${entry.path}`} className="absolute top-0 left-0 w-full px-3" style={{ transform: `translateY(${item.start}px)` }}>
                  <DeletionRow
                    entry={entry}
                    onRestore={() => void restoreDeletion(entry.path)}
                    onOpenBin={() => void openRecycleBinFolder()}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DeletionRow({
  entry,
  onRestore,
  onOpenBin,
}: {
  entry: DeletionLogEntry;
  onRestore: () => void;
  onOpenBin: () => void;
}) {
  const name = pathTail(entry.path);
  return (
    <article className="rounded-md border border-white/10 px-2 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-100" title={name}>
            {name}
          </p>
          <p className="truncate text-[11px] text-slate-500" title={entry.path}>
            {entry.path}
          </p>
          <p className="text-[11px] text-slate-400">
            {formatWhen(entry.unixMs)} · {methodLabel(entry.method)} · {formatBytes(entry.sizeBytes)}
          </p>
        </div>
        {entry.method === "recycleBin" ? (
          <div className="flex shrink-0 flex-col gap-1">
            <button type="button" className="h-7 rounded-md border border-cyan-300/40 px-2 text-[11px] text-cyan-100" onClick={onRestore}>
              Restore
            </button>
            <button type="button" className="h-7 rounded-md border border-white/10 px-2 text-[11px] text-slate-300" onClick={onOpenBin}>
              Open bin
            </button>
          </div>
        ) : (
          <span className="shrink-0 text-[11px] text-rose-200/80">Permanent</span>
        )}
      </div>
    </article>
  );
}

function methodLabel(method: DeletionMethod): string {
  switch (method) {
    case "recycleBin":
      return "Recycle Bin";
    case "permanent":
      return "Permanent";
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}

function formatWhen(unixMs: number): string {
  if (!Number.isFinite(unixMs) || unixMs <= 0) return "Unknown time";
  try {
    return new Date(unixMs).toLocaleString();
  } catch {
    return "Unknown time";
  }
}
