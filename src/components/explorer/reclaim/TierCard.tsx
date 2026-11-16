import { useRef, type Ref } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes } from "../../../lib/format";
import { isOldDownload, parentFolder } from "../../../lib/reclaimView";
import type { ReclaimRow, ReclaimTier } from "../../../types/filesystem";
import { useFileStore } from "../../../store/useFileStore";

const ROW_ESTIMATE = 96;
const LIST_MAX = 320;

interface TierAction {
  label: string;
  disabled: boolean;
  className: string;
  onClick: () => void;
}

interface TierCardProps {
  title: string;
  bytes: number;
  rimClass: string;
  rows: ReclaimRow[];
  tier: ReclaimTier;
  empty: string | null;
  action?: TierAction;
  checked: Set<string>;
  showCheck: boolean;
  accentClass: string;
  showRecycle: boolean;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (row: ReclaimRow) => void;
  onRecycle?: (row: ReclaimRow) => void;
  sectionRef?: Ref<HTMLElement>;
}

export function TierCard({
  title,
  bytes,
  rimClass,
  rows,
  tier,
  empty,
  action,
  checked,
  showCheck,
  accentClass,
  showRecycle,
  selectedId,
  onToggle,
  onSelect,
  onRecycle,
  sectionRef,
}: TierCardProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 4,
  });
  const listHeight = Math.min(virtualizer.getTotalSize(), LIST_MAX);

  return (
    <section ref={sectionRef} className={`scroll-mt-2 rounded-xl border bg-[#0B1020] ${rimClass}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h3 className="min-w-0 text-sm font-medium text-slate-100">
          {title} <span className="font-normal text-slate-400 tabular-nums">{formatBytes(bytes)}</span>
        </h3>
        {action ? (
          <button type="button" disabled={action.disabled} className={action.className} onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
      {rows.length === 0 && empty ? <p className="px-3 pb-3 text-xs text-slate-500">{empty}</p> : null}
      {rows.length > 0 ? (
        <div ref={parentRef} className="overflow-auto px-2 pb-2" style={{ height: listHeight }}>
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <div
                  key={row.id}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-2"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <ReclaimRow
                    row={row}
                    tier={tier}
                    selected={selectedId === row.id}
                    checked={checked.has(row.id)}
                    showCheck={showCheck}
                    accentClass={accentClass}
                    showRecycle={showRecycle}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    onRecycle={onRecycle}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReclaimRow({
  row,
  tier,
  selected,
  checked,
  showCheck,
  accentClass,
  showRecycle,
  onToggle,
  onSelect,
  onRecycle,
}: {
  row: ReclaimRow;
  tier: ReclaimTier;
  selected: boolean;
  checked: boolean;
  showCheck: boolean;
  accentClass: string;
  showRecycle: boolean;
  onToggle: (id: string) => void;
  onSelect: (row: ReclaimRow) => void;
  onRecycle?: (row: ReclaimRow) => void;
}) {
  const reveal = useFileStore((state) => state.reveal);
  const pathLabel = tier === "rebuild" ? parentFolder(row.revealPath) : row.revealPath;

  return (
    <div className={`flex gap-2 rounded-lg px-2 py-2 ${selected ? "bg-white/10" : ""}`}>
      {showCheck ? (
        <input
          type="checkbox"
          className={`mt-1 h-4 w-4 shrink-0 ${accentClass}`}
          checked={checked}
          disabled={!row.canRecycle}
          aria-label={`Include ${row.title}`}
          onChange={() => onToggle(row.id)}
        />
      ) : null}
      <button type="button" className="min-w-0 flex-1 rounded-md text-left hover:bg-white/[0.04]" aria-pressed={selected} onClick={() => onSelect(row)}>
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-sm text-slate-100" title={row.title}>
            {row.title}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-slate-300 tabular-nums">{formatBytes(row.sizeBytes)}</span>
        </span>
        <span className="mt-1 block text-xs text-slate-400">{row.sentence}</span>
        <span className="mt-1 block truncate font-mono text-[11px] text-slate-500" title={row.revealPath}>
          {pathLabel}
        </span>
        {isOldDownload(row) ? (
          <span className="mt-1 inline-flex rounded-full bg-rose-400/15 px-2 py-0.5 text-[10px] text-rose-200">Over 30 days</span>
        ) : null}
      </button>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          type="button"
          className="h-7 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/5"
          onClick={(event) => {
            event.stopPropagation();
            void reveal(row.revealPath);
          }}
        >
          Reveal
        </button>
        {showRecycle && row.canRecycle && onRecycle ? (
          <button
            type="button"
            className="h-7 rounded-md border border-rose-400/50 px-2 text-xs text-rose-100 hover:bg-rose-400/10"
            onClick={(event) => {
              event.stopPropagation();
              onRecycle(row);
            }}
          >
            Recycle
          </button>
        ) : null}
      </div>
    </div>
  );
}
