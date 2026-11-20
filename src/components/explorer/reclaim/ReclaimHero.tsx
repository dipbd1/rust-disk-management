import { formatBytes } from "../../../lib/format";
import type { ReclaimFigures } from "../../../lib/reclaimView";
import { ReclaimDonut, type DonutSlice } from "./ReclaimDonut";
import { reclaimButton } from "./buttons";
import { reclaimPalette } from "./palette";

interface ReclaimHeroProps {
  figures: ReclaimFigures;
  checkedBytes: number;
  onReclaim: () => void;
  onReview: () => void;
}

export function ReclaimHero({ figures, checkedBytes, onReclaim, onReview }: ReclaimHeroProps) {
  const slices: DonutSlice[] = [
    { id: "safe", bytes: figures.comesBack, color: reclaimPalette.safe },
    { id: "rebuild", bytes: figures.rebuilds, color: reclaimPalette.rebuild },
  ];

  return (
    <section className="rounded-2xl border border-cyan-400/30 bg-[#0B1020] p-4 shadow-[0_0_36px_rgba(0,240,255,0.08)]">
      <div className="flex flex-wrap items-center gap-4">
        <ReclaimDonut slices={slices} />
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 @min-[520px]:grid-cols-2">
          <Figure label="Comes back" bytes={figures.comesBack} caption="Scratch files. Windows and browsers recreate them." color={reclaimPalette.safe} />
          <Figure label="Rebuilds" bytes={figures.rebuilds} caption="Comes back the next install or build." color={reclaimPalette.rebuild} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={checkedBytes <= 0}
          className={reclaimButton.primary}
          style={{ backgroundImage: `linear-gradient(90deg, ${reclaimPalette.safe}, ${reclaimPalette.glow})`, color: reclaimPalette.page }}
          onClick={onReclaim}
        >
          {checkedBytes > 0 ? `Move scratch files (${formatBytes(checkedBytes)})` : "Move scratch files"}
        </button>
        <button type="button" className={reclaimButton.ghost} onClick={onReview}>
          Advanced review
        </button>
      </div>
      {figures.review > 0 ? (
        <p className="mt-3 text-xs text-slate-400">Review holds {formatBytes(figures.review)}. Those are your files, one at a time.</p>
      ) : null}
    </section>
  );
}

function Figure({ label, bytes, caption, color }: { label: string; bytes: number | null; caption: string; color: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] tracking-wide uppercase" style={{ color }}>
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-slate-50 tabular-nums">{bytes === null ? "Unavailable" : formatBytes(bytes)}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
    </div>
  );
}
