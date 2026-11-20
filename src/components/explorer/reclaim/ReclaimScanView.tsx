import { idleReclaimProgress, reclaimGroupLabel, scannedPercent } from "../../../lib/reclaimProgress";
import type { ReclaimProgress } from "../../../types/filesystem";
import { reclaimButton } from "./buttons";
import { reclaimPalette } from "./palette";

const SIZE = 132;
const CENTER = SIZE / 2;
const RADIUS = 54;
const STROKE = 10;

export function ReclaimScanView({ progress, onCancel }: { progress: ReclaimProgress | null; onCancel: () => void }) {
  const live = progress ?? idleReclaimProgress();
  const percent = scannedPercent(live);
  const heading = live.phase === "bin" ? "Checking the Recycle Bin…" : "Checking the index…";
  const path = live.currentPath || "Reading the index";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-3 pb-4">
      <div className="flex flex-col items-center px-2 pt-2">
        <ProgressRing percent={percent} />
        <h3 className="mt-4 text-center text-base font-semibold text-slate-50">{heading}</h3>
        <p className="mt-1 w-full truncate text-center text-xs text-slate-400" title={live.currentPath || undefined}>
          {path}
        </p>
      </div>
      <ul className="mt-4 flex flex-col">
        {live.groups.map((group) => (
          <li key={group.id} className="flex items-center justify-between gap-3 border-b border-white/10 py-2.5">
            <span className="min-w-0 truncate text-sm text-slate-100">{group.title}</span>
            <span className="shrink-0 text-xs text-slate-400 tabular-nums">{reclaimGroupLabel(group)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className={`${reclaimButton.secondary} mt-4 self-center`} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const circumference = 2 * Math.PI * RADIUS;
  const filled = (percent / 100) * circumference;
  return (
    <div className="relative grid h-[132px] w-[132px] place-items-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Index checked"
      >
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke={reclaimPalette.track} strokeWidth={STROKE} />
        {percent > 0 ? (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={reclaimPalette.glow}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            style={{ filter: "drop-shadow(0 0 6px rgba(0, 240, 255, 0.7))" }}
          />
        ) : null}
      </svg>
      <div className="text-center">
        <p className="text-[28px] leading-none font-semibold text-slate-50 tabular-nums">{percent}%</p>
        <p className="mt-1 text-[11px] text-slate-400">Scanned</p>
      </div>
    </div>
  );
}
