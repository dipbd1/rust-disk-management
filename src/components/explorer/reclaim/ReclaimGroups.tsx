import type { Ref } from "react";
import { formatBytes } from "../../../lib/format";
import { rowsByTier, type ReclaimFigures } from "../../../lib/reclaimView";
import type { ReclaimRow } from "../../../types/filesystem";
import { TierCard } from "./TierCard";

interface ReclaimGroupsProps {
  rows: ReclaimRow[];
  figures: ReclaimFigures;
  checked: Set<string>;
  selectedId: string | null;
  reviewRef: Ref<HTMLElement>;
  onToggle: (id: string) => void;
  onSelect: (row: ReclaimRow) => void;
  onClearSafe: () => void;
  onClearRebuild: () => void;
  onRecycle: (row: ReclaimRow) => void;
}

const SAFE_ACTION = "h-8 shrink-0 rounded-full border border-cyan-300/50 px-3 text-xs text-cyan-100 disabled:opacity-40";
const REBUILD_ACTION = "h-8 shrink-0 rounded-full border border-amber-300/50 px-3 text-xs text-amber-100 disabled:opacity-40";

export function ReclaimGroups({
  rows,
  figures,
  checked,
  selectedId,
  reviewRef,
  onToggle,
  onSelect,
  onClearSafe,
  onClearRebuild,
  onRecycle,
}: ReclaimGroupsProps) {
  const safe = rowsByTier(rows, "safe");
  const rebuild = rowsByTier(rows, "rebuild");
  const review = rowsByTier(rows, "review");
  const system = rowsByTier(rows, "system");
  const safeChecked = safe.filter((row) => checked.has(row.id) && row.canRecycle);
  const rebuildChecked = rebuild.filter((row) => checked.has(row.id) && row.canRecycle);
  const shared = { checked, selectedId, onToggle, onSelect };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {safe.length > 0 ? (
        <TierCard
          {...shared}
          title="Scratch files"
          bytes={figures.comesBack}
          rimClass="border-cyan-400/30"
          rows={safe}
          tier="safe"
          empty={null}
          showCheck
          accentClass="accent-cyan-400"
          showRecycle={false}
          action={{
            label: safeChecked.length > 0 ? `Move ${formatBytes(sumBytes(safeChecked))} to bin` : "Move to bin",
            disabled: safeChecked.length === 0,
            className: SAFE_ACTION,
            onClick: onClearSafe,
          }}
        />
      ) : null}
      {rebuild.length > 0 ? (
        <TierCard
          {...shared}
          title="Rebuilds"
          bytes={figures.rebuilds}
          rimClass="border-amber-400/35"
          rows={rebuild}
          tier="rebuild"
          empty={null}
          showCheck
          accentClass="accent-amber-400"
          showRecycle={false}
          action={{
            label: rebuildChecked.length > 0 ? `Move ${formatBytes(sumBytes(rebuildChecked))} to bin` : "Move to bin",
            disabled: rebuildChecked.length === 0,
            className: REBUILD_ACTION,
            onClick: onClearRebuild,
          }}
        />
      ) : null}
      <TierCard
        {...shared}
        sectionRef={reviewRef}
        title="Review before deleting"
        bytes={figures.review}
        rimClass="border-rose-400/35"
        rows={review}
        tier="review"
        empty="Nothing to review."
        showCheck={false}
        accentClass=""
        showRecycle
        onRecycle={onRecycle}
      />
      {system.length > 0 ? (
        <TierCard
          {...shared}
          title="Leave these"
          bytes={sumBytes(system)}
          rimClass="border-white/10"
          rows={system}
          tier="system"
          empty={null}
          showCheck={false}
          accentClass=""
          showRecycle={false}
        />
      ) : null}
    </div>
  );
}

function sumBytes(rows: ReclaimRow[]): number {
  return rows.reduce((sum, row) => sum + row.sizeBytes, 0);
}
