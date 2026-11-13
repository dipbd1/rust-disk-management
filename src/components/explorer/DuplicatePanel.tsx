import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes } from "../../lib/format";
import { duplicateLabel } from "../../store/cleanupActions";
import { useFileStore } from "../../store/useFileStore";

const ROW_HEIGHT = 112;

export function DuplicatePanel() {
  const scanStatus = useFileStore((state) => state.scanStatus);
  const run = useFileStore((state) => state.duplicateRun);
  const startDuplicates = useFileStore((state) => state.startDuplicates);
  const cancelDuplicates = useFileStore((state) => state.cancelDuplicates);
  const promptRecycle = useFileStore((state) => state.promptRecycle);
  const parentRef = useRef<HTMLDivElement>(null);
  const groups = run?.groups ?? [];
  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          disabled={scanStatus === "scanning" || run?.running}
          className="h-7 rounded-md border border-cyan-300/40 px-2 text-xs text-cyan-100 disabled:opacity-40"
          onClick={() => void startDuplicates()}
        >
          Find duplicates
        </button>
        {run?.running ? (
          <button type="button" className="h-7 rounded-md border border-white/10 px-2 text-xs" onClick={() => void cancelDuplicates()}>
            Cancel
          </button>
        ) : null}
        {run ? <span className="truncate text-[11px] text-slate-400">{duplicateLabel(run)}</span> : null}
      </div>
      <p className="px-3 pb-2 text-xs text-slate-500">
        Hashes files of 1 MiB or more that share a size. Hard links, cloud-only files, and protected folders are skipped. One copy is kept.
      </p>
      {run?.currentPath && run.running ? <p className="truncate px-3 pb-2 text-[11px] text-slate-400">{run.currentPath}</p> : null}
      {run?.truncated ? <p className="px-3 pb-2 text-[11px] text-amber-200">Showing the largest duplicate groups.</p> : null}
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        {groups.length === 0 ? (
          <p className="px-3 py-2 text-sm text-slate-500">{run?.done ? "No duplicate groups." : "Start a review when you want it. It does not run during a scan."}</p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const group = groups[item.index];
              if (!group) return null;
              return (
                <div key={group.id} className="absolute top-0 left-0 w-full px-3" style={{ transform: `translateY(${item.start}px)` }}>
                  <article className="rounded-md border border-white/10 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-slate-100">{formatBytes(group.wastedBytes)} wasted</p>
                      <button
                        type="button"
                        className="h-7 rounded-md border border-amber-300/40 px-2 text-xs text-amber-100"
                        onClick={() =>
                          promptRecycle({
                            kind: "duplicates",
                            paths: group.copies.map((copy) => copy.path),
                            title: "Recycle the extra copies?",
                            body: `Move ${group.copies.length.toLocaleString()} copies (${formatBytes(group.wastedBytes)}) to the Recycle Bin. The keeper stays: ${group.keeper.path}`,
                          })
                        }
                      >
                        Recycle copies
                      </button>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-cyan-100" title={group.keeper.path}>
                      Keep {group.keeper.name}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">{group.copies.map((copy) => copy.name).join(", ")}</p>
                  </article>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
