import { RECLAIM_LOOKUPS } from "../../../lib/reclaimProgress";
import { reclaimButton } from "./buttons";
import { reclaimPalette } from "./palette";

export function ReclaimIntro({ onScan }: { onScan: () => void }) {
  return (
    <div className="@container flex min-h-0 flex-1 flex-col overflow-auto px-3 pb-4">
      <h3 className="text-base font-semibold text-slate-50">Free up disk space</h3>
      <p className="mt-2 max-w-prose text-sm text-slate-400">
        Check this scan for caches, temporary files, and other space you can reclaim. Nothing is removed until you confirm.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-y-2 @min-[420px]:grid-cols-2" aria-label="What this scan looks for">
        {RECLAIM_LOOKUPS.map((label) => (
          <li key={label} className="flex min-w-0 items-center gap-2 text-sm text-slate-200">
            <span className="size-1.5 shrink-0 rounded-full bg-slate-500" aria-hidden="true" />
            <span className="min-w-0">{label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-400">System files are only explained. The Recycle Bin is emptied from its own button.</p>
      <button
        type="button"
        className={`${reclaimButton.primary} mt-5 self-start`}
        style={{ backgroundImage: `linear-gradient(90deg, ${reclaimPalette.bin}, ${reclaimPalette.glow})`, color: reclaimPalette.page }}
        onClick={onScan}
      >
        Scan
      </button>
    </div>
  );
}
