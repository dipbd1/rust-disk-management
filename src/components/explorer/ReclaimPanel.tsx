import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes } from "../../lib/format";
import type { ReclaimRow, ReclaimTier, RecycleBinStatus } from "../../types/filesystem";
import { useFileStore } from "../../store/useFileStore";

const ORDER: ReclaimTier[] = ["safe", "rebuild", "review", "system"];
const TITLES: Record<ReclaimTier, string> = {
  safe: "Safe",
  rebuild: "Rebuilds",
  review: "Review",
  system: "System",
};

type Line = { key: string; kind: "tier"; tier: ReclaimTier; ids: string[]; count: number; bytes: number } | { key: string; kind: "row"; row: ReclaimRow };

function ready(status: string): boolean {
  return status === "ready" || status === "cancelled";
}

export function ReclaimPanel() {
  const scanStatus = useFileStore((state) => state.scanStatus);
  const report = useFileStore((state) => state.reclaim);
  const loadReclaim = useFileStore((state) => state.loadReclaim);
  useEffect(() => {
    if (ready(scanStatus)) void loadReclaim();
  }, [scanStatus, loadReclaim]);
  if (!ready(scanStatus)) return <p className="px-3 py-4 text-sm text-slate-500">Finish a scan to see what can be reclaimed.</p>;
  return <ReclaimList rows={report?.rows ?? []} bin={report?.recycleBin ?? null} />;
}

function ReclaimList({ rows, bin }: { rows: ReclaimRow[]; bin: RecycleBinStatus | null }) {
  const promptRecycle = useFileStore((state) => state.promptRecycle);
  const lines = useMemo(() => {
    const next: Line[] = [];
    for (const tier of ORDER) {
      const group = rows.filter((row) => row.tier === tier);
      if (group.length === 0) continue;
      const recyclable = group.filter((row) => row.canRecycle);
      next.push({
        key: tier,
        kind: "tier",
        tier,
        ids: recyclable.map((row) => row.id),
        count: recyclable.reduce((sum, row) => sum + row.itemCount, 0),
        bytes: recyclable.reduce((sum, row) => sum + row.sizeBytes, 0),
      });
      for (const row of group) next.push({ key: row.id, kind: "row", row });
    }
    return next;
  }, [rows]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (lines[index]?.kind === "tier" ? 40 : 108),
    overscan: 6,
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {bin ? (
        <section className="shrink-0 border-b border-white/10 px-3 py-3">
          <h3 className="text-xs tracking-wide text-slate-400 uppercase">Recycle Bin</h3>
          <p className="mt-1 text-sm text-slate-200">{bin.available ? `${formatBytes(bin.sizeBytes)} · ${bin.itemCount.toLocaleString()} items` : "Size unavailable"}</p>
          <p className="mt-1 text-xs text-slate-400">These items are already in the Recycle Bin. Emptying it removes them from the bin.</p>
          <button
            type="button"
            className="mt-2 h-7 rounded-md border border-white/10 px-2 text-xs hover:bg-white/5"
            onClick={() =>
              promptRecycle({
                kind: "bin",
                title: "Empty the Recycle Bin?",
                body: `Windows will permanently remove ${formatBytes(bin.sizeBytes)} already in the bin. This does not use the app's permanent delete.`,
              })
            }
          >
            Empty Recycle Bin
          </button>
        </section>
      ) : null}
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const line = lines[item.index];
            if (!line) return null;
            return (
              <div key={line.key} className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${item.start}px)` }}>
                {line.kind === "tier" ? <TierHead line={line} /> : <ReclaimItem row={line.row} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TierHead({ line }: { line: Extract<Line, { kind: "tier" }> }) {
  const promptRecycle = useFileStore((state) => state.promptRecycle);
  const grouped = line.tier === "safe" || line.tier === "rebuild";
  return (
    <div className="flex h-10 items-center justify-between px-3">
      <h3 className="text-xs tracking-wide text-slate-400 uppercase">{TITLES[line.tier]}</h3>
      {grouped ? (
        <button
          type="button"
          disabled={line.ids.length === 0}
          className="h-7 rounded-md border border-amber-300/40 px-2 text-xs text-amber-100 disabled:opacity-40"
          onClick={() =>
            promptRecycle({
              kind: "reclaim",
              ids: line.ids,
              title: `Recycle ${TITLES[line.tier].toLowerCase()}?`,
              body: `Move ${line.count.toLocaleString()} items (${formatBytes(line.bytes)}) to the Recycle Bin. You can restore them from the bin.`,
            })
          }
        >
          Recycle {formatBytes(line.bytes)}
        </button>
      ) : null}
    </div>
  );
}

function ReclaimItem({ row }: { row: ReclaimRow }) {
  const reveal = useFileStore((state) => state.reveal);
  const promptRecycle = useFileStore((state) => state.promptRecycle);
  return (
    <div className="mx-3 rounded-md border border-white/10 px-2 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-slate-100" title={row.revealPath}>
          {row.title}
        </p>
        <span className="shrink-0 font-mono text-[11px] text-slate-300">{formatBytes(row.sizeBytes)}</span>
      </div>
      <p className="mt-1 truncate text-xs text-slate-400">{row.sentence}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="h-7 rounded-md border border-white/10 px-2 text-xs" onClick={() => void reveal(row.revealPath)}>
          Reveal
        </button>
        {row.canRecycle && row.tier === "review" ? (
          <button
            type="button"
            className="h-7 rounded-md border border-amber-300/40 px-2 text-xs text-amber-100"
            onClick={() =>
              promptRecycle({
                kind: "reclaim",
                ids: [row.id],
                title: "Move this to the Recycle Bin?",
                body: `${row.title} · ${formatBytes(row.sizeBytes)}. You can restore it from the bin.`,
              })
            }
          >
            Recycle
          </button>
        ) : null}
      </div>
    </div>
  );
}
