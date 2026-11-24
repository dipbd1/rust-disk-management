import { useRef, useState } from "react";
import { graphFolder, groupPrompt, initialChecked, reclaimFigures, reclaimHasContent, rowsByTier } from "../../lib/reclaimView";
import { useFileStore } from "../../store/useFileStore";
import type { ReclaimReport, ReclaimRow, ReclaimTier } from "../../types/filesystem";
import { reclaimButton } from "./reclaim/buttons";
import { RecycleBinCard } from "./reclaim/RecycleBinCard";
import { ReclaimGroups } from "./reclaim/ReclaimGroups";
import { ReclaimHero } from "./reclaim/ReclaimHero";
import { ReclaimIntro } from "./reclaim/ReclaimIntro";
import { ReclaimScanView } from "./reclaim/ReclaimScanView";

const SCAN_WAIT = "Scanning in progress. Please wait.";

function ready(status: string): boolean {
  return status === "ready" || status === "cancelled";
}

export function ReclaimPanel() {
  const scanStatus = useFileStore((state) => state.scanStatus);
  const report = useFileStore((state) => state.reclaim);
  const reclaimBusy = useFileStore((state) => state.reclaimBusy);
  const reclaimProgress = useFileStore((state) => state.reclaimProgress);
  const loadReclaim = useFileStore((state) => state.loadReclaim);
  const cancelReclaim = useFileStore((state) => state.cancelReclaim);
  const finished = ready(scanStatus);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-3 py-3">
        <h2 className="text-lg font-semibold text-slate-50">Reclaim Space</h2>
        {report && !reclaimBusy ? (
          <button type="button" disabled={!finished} className={reclaimButton.secondary} onClick={() => void loadReclaim()}>
            Re-scan
          </button>
        ) : null}
      </div>
      {reclaimBusy ? (
        <ReclaimScanView progress={reclaimProgress} onCancel={() => void cancelReclaim()} />
      ) : !finished ? (
        <p className="px-3 py-2 text-sm text-slate-500">Finish a scan to see what can be reclaimed.</p>
      ) : report && reclaimHasContent(report) ? (
        <ReclaimDashboard report={report} />
      ) : report ? (
        <p className="px-3 py-2 text-sm text-slate-500">Nothing to reclaim.</p>
      ) : (
        <ReclaimIntro onScan={() => void loadReclaim()} />
      )}
    </div>
  );
}

function ReclaimDashboard({ report }: { report: ReclaimReport }) {
  const promptRecycle = useFileStore((state) => state.promptRecycle);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const [checked, setChecked] = useState(() => initialChecked(report.rows));
  const [seen, setSeen] = useState(report.rows);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openTier, setOpenTier] = useState<ReclaimTier | null>(null);
  if (seen !== report.rows) {
    setSeen(report.rows);
    setChecked(initialChecked(report.rows));
    setSelectedId(null);
    setOpenTier(null);
  }

  const figures = reclaimFigures(report);
  const safeChecked = rowsByTier(report.rows, "safe").filter((row) => checked.has(row.id) && row.canRecycle);
  const checkedBytes = safeChecked.reduce((sum, row) => sum + row.sizeBytes, 0);

  const toggle = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectRow = (row: ReclaimRow) => {
    setSelectedId(row.id);
    const state = useFileStore.getState();
    if (state.scanStatus === "scanning") {
      useFileStore.setState({ toast: SCAN_WAIT });
      return;
    }
    void state.focusNode(graphFolder(row));
  };

  const clearTier = (kind: "safe" | "rebuild") => {
    const picked = rowsByTier(report.rows, kind).filter((row) => checked.has(row.id) && row.canRecycle);
    if (picked.length === 0) return;
    promptRecycle({ kind: "reclaim", ids: picked.map((row) => row.id), ...groupPrompt(kind, picked) });
  };

  const toggleTier = (tier: ReclaimTier) => {
    setOpenTier((current) => (current === tier ? null : tier));
  };

  const openReview = () => {
    setOpenTier("review");
    requestAnimationFrame(() => {
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div ref={scrollRef} className="reclaim-dashboard @container min-h-0 flex-1 overflow-auto px-3 pb-4">
      <ReclaimHero
        figures={figures}
        checkedBytes={checkedBytes}
        onReclaim={() => clearTier("safe")}
        onReview={openReview}
      />
      <div className="mt-3 grid gap-3 @min-[960px]:grid-cols-[13.5rem_minmax(0,1fr)]">
        <RecycleBinCard bin={report.recycleBin} />
        <ReclaimGroups
          rows={report.rows}
          figures={figures}
          checked={checked}
          selectedId={selectedId}
          reviewRef={reviewRef}
          scrollRef={scrollRef}
          openTier={openTier}
          onOpen={toggleTier}
          onToggle={toggle}
          onSelect={selectRow}
          onClearSafe={() => clearTier("safe")}
          onClearRebuild={() => clearTier("rebuild")}
          onRecycle={(row) =>
            promptRecycle({
              kind: "reclaim",
              ids: [row.id],
              title: "Move this to the Recycle Bin?",
              items: [{ path: row.revealPath, name: row.title, sizeBytes: row.sizeBytes }],
              totalCount: row.itemCount || 1,
              totalBytes: row.sizeBytes,
              note: "You can restore it from the Recycle Bin or the Deleted tab.",
            })
          }
        />
      </div>
    </div>
  );
}
