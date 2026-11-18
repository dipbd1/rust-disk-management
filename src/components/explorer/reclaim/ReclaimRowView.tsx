import { formatBytes } from "../../../lib/format";
import { isOldDownload, parentFolder } from "../../../lib/reclaimView";
import { useFileStore } from "../../../store/useFileStore";
import type { ReclaimRow, ReclaimTier } from "../../../types/filesystem";
import { reclaimButton, reclaimFocus } from "./buttons";

interface ReclaimRowViewProps {
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
}

export function ReclaimRowView({
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
}: ReclaimRowViewProps) {
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
      <button type="button" className={`min-w-0 flex-1 rounded-md text-left hover:bg-white/[0.04] ${reclaimFocus}`} aria-pressed={selected} onClick={() => onSelect(row)}>
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
          className={reclaimButton.row}
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
            className={reclaimButton.rowDanger}
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
