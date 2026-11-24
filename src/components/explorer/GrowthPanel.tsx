import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes } from "../../lib/format";
import { useFileStore } from "../../store/useFileStore";
import type { GrowthEntry } from "../../types/filesystem";
import { GrowthRow } from "./GrowthRow";
import { buildGrowthRows, signedBytes, type GrowthOrder, type GrowthSort } from "./growthSort";

const NO_ENTRIES: GrowthEntry[] = [];

const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 28;

const SORTS: { id: GrowthSort; label: string }[] = [
  { id: "growth", label: "Growth" },
  { id: "size", label: "Size" },
  { id: "kind", label: "Kind" },
];

function countPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function directionLabel(sort: GrowthSort, descending: boolean): string {
  if (sort === "kind") return descending ? "folders first" : "files first";
  if (sort === "size") return descending ? "largest size first" : "smallest size first";
  return descending ? "largest increase first" : "smallest increase first";
}

export function GrowthPanel() {
  const growth = useFileStore((state) => state.growth);
  const scanStatus = useFileStore((state) => state.scanStatus);
  const selectedNodeId = useFileStore((state) => state.selectedNodeId);
  const openGrowth = useFileStore((state) => state.openGrowth);
  const [order, setOrder] = useState<GrowthOrder>({ sort: "growth", descending: true });
  const entries = growth?.entries ?? NO_ENTRIES;
  const rows = useMemo(() => buildGrowthRows(entries, order), [entries, order]);
  const maxDelta = useMemo(() => {
    let max = 0;
    for (const entry of entries) if (entry.deltaBytes > max) max = entry.deltaBytes;
    return max;
  }, [entries]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.type === "header" ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 8,
    getItemKey: (index) => {
      const row = rows[index];
      if (!row) return index;
      return row.type === "header" ? `header-${row.id}` : row.entry.path;
    },
  });

  const chooseSort = (sort: GrowthSort) => {
    setOrder((current) => {
      if (current.sort === sort) return { sort, descending: !current.descending };
      return { sort, descending: true };
    });
  };

  if (scanStatus === "scanning") return <p className="px-3 py-4 text-sm text-slate-500">Growth appears when this scan finishes.</p>;
  if (!growth || !growth.hasBaseline) {
    return <p className="px-3 py-4 text-sm text-slate-500">Scan this same place again to see which folders grew and which large files are new or bigger.</p>;
  }

  const folders = entries.filter((entry) => entry.kind === "folder").length;
  const files = entries.length - folders;
  const net = growth.totalBytes - growth.previousTotal;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-2">
        <p className="text-xs">
          <span className={net < 0 ? "text-rose-200" : "text-emerald-200"}>{signedBytes(net)}</span>
          <span className="text-slate-400">
            {" "}
            · {formatBytes(growth.totalBytes)} now · was {formatBytes(growth.previousTotal)}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {countPhrase(folders, "folder", "folders")} · {countPhrase(files, "file", "files")}
        </p>
      </div>
      {entries.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-2 py-2">
          {SORTS.map((chip) => {
            const active = order.sort === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                aria-label={active ? `${chip.label}, ${directionLabel(chip.id, order.descending)}` : chip.label}
                className={`h-6 shrink-0 rounded-full px-2 text-[11px] ${active ? "bg-cyan-400/15 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}
                onClick={() => chooseSort(chip.id)}
              >
                {chip.label}
                {active ? (order.descending ? " ↓" : " ↑") : ""}
              </button>
            );
          })}
        </div>
      ) : null}
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        {entries.length === 0 ? (
          <p className="px-3 text-sm text-slate-500">Nothing grew in the saved snapshot.</p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <div key={item.key} className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${item.start}px)` }}>
                  {row.type === "header" ? (
                    <div className="flex h-7 items-center gap-2 px-3 text-[11px] text-slate-500">
                      <span>{row.label}</span>
                      <span className="tabular-nums">{row.count}</span>
                    </div>
                  ) : (
                    <GrowthRow
                      entry={row.entry}
                      maxDelta={maxDelta}
                      selected={selectedNodeId === row.entry.path}
                      onOpen={(entry) => void openGrowth(entry)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
