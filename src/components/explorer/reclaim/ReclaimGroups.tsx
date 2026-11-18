import type { Ref, RefObject } from "react";
import { formatBytes } from "../../../lib/format";
import { rowsByTier, type ReclaimFigures } from "../../../lib/reclaimView";
import type { ReclaimRow, ReclaimTier } from "../../../types/filesystem";
import { reclaimButton } from "./buttons";
import { TierCard } from "./TierCard";

interface ReclaimGroupsProps {
  rows: ReclaimRow[];
  figures: ReclaimFigures;
  checked: Set<string>;
  selectedId: string | null;
  reviewRef: Ref<HTMLElement>;
  scrollRef: RefObject<HTMLDivElement | null>;
  openTier: ReclaimTier | null;
  onOpen: (tier: ReclaimTier) => void;
  onToggle: (id: string) => void;
  onSelect: (row: ReclaimRow) => void;
  onClearSafe: () => void;
  onClearRebuild: () => void;
  onRecycle: (row: ReclaimRow) => void;
}

export function ReclaimGroups({
  rows,
  figures,
  checked,
  selectedId,
  reviewRef,
  scrollRef,
  openTier,
  onOpen,
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
  const shared = { checked, selectedId, scrollRef, onToggle, onSelect };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {safe.length > 0 ? (
        <TierCard
          {...shared}
          open={openTier === "safe"}
          onToggleOpen={() => onOpen("safe")}
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
            className: reclaimButton.safe,
            onClick: onClearSafe,
          }}
        />
      ) : null}
      {rebuild.length > 0 ? (
        <TierCard
          {...shared}
          open={openTier === "rebuild"}
          onToggleOpen={() => onOpen("rebuild")}
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
            className: reclaimButton.rebuild,
            onClick: onClearRebuild,
          }}
        />
      ) : null}
      <TierCard
        {...shared}
        sectionRef={reviewRef}
        open={openTier === "review"}
        onToggleOpen={() => onOpen("review")}
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
          open={openTier === "system"}
          onToggleOpen={() => onOpen("system")}
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
