import { reclaimPalette } from "./palette";

export interface DonutSlice {
  id: string;
  bytes: number;
  color: string;
}

const SIZE = 104;
const CENTER = SIZE / 2;
const RADIUS = 38;
const STROKE = 12;

export function ReclaimDonut({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.bytes, 0);
  const live = slices.filter((slice) => slice.bytes > 0);
  const circumference = 2 * Math.PI * RADIUS;
  const gap = live.length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" className="shrink-0">
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke={reclaimPalette.track} strokeWidth={STROKE} />
      {total > 0 ? (
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          {live.map((slice) => {
            const share = (slice.bytes / total) * circumference;
            const length = share > gap * 2 ? share - gap : share;
            const element = (
              <circle
                key={slice.id}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={slice.color}
                strokeWidth={STROKE}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
              />
            );
            offset += share;
            return element;
          })}
        </g>
      ) : null}
    </svg>
  );
}
