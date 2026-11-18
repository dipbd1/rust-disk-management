import { useRef, useState } from "react";
import { formatBytes } from "../../lib/format";
import { graphFolder, groupPrompt, initialChecked, reclaimFigures, reclaimHasContent, rowsByTier } from "../../lib/reclaimView";
import { useFileStore } from "../../store/useFileStore";
import type { ReclaimReport, ReclaimRow, ReclaimTier } from "../../types/filesystem";
import { RecycleBinCard } from "./reclaim/RecycleBinCard";
import { ReclaimGroups } from "./reclaim/ReclaimGroups";
import { ReclaimHero } from "./reclaim/ReclaimHero";

const SCAN_WAIT = "Scanning in progress. Please wait.";

function ready(status: string): boolean {
  return status === "ready" || status === "cancelled";
}

export function ReclaimPanel() {
  const scanStatus = useFileStore((state) => state.scanStatus);
  const report = useFileStore((state) => state.reclaim);
  const reclaimBusy = useFileStore((state) => state.reclaimBusy);
  const loadReclaim = useFileStore((state) => state.loadReclaim);
  const finished = ready(scanStatus);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-3 py-3">
        <h2 className="text-lg font-semibold text-slate-50">Reclaim Space</h2>
        <button
          type="button"
          disabled={!finished || reclaimBusy}
          className="h-8 shrink-0 rounded-full border border-cyan-300/40 px-3 text-xs text-cyan-100 disabled:opacity-40"
          onClick={() => void loadReclaim()}
        >
          {report ? "Re-scan" : "Scan"}
        </button>
        {reclaimBusy ? <span className="text-xs text-slate-500">Scanning claims…</span> : null}
      </div>
      {!finished ? (
        <p className="px-3 py-2 text-sm text-slate-500">Finish a scan to see what can be reclaimed.</p>
      ) : report && reclaimHasContent(report) ? (
        <ReclaimDashboard report={report} />
      ) : report ? (
        <p className="px-3 py-2 text-sm text-slate-500">Nothing to reclaim.</p>
      ) : reclaimBusy ? null : (
        <p className="px-3 py-2 text-sm text-slate-500">Scan to list caches and other space you can reclaim.</p>
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
              body: `${row.title}\n${row.revealPath}\n\n${formatBytes(row.sizeBytes)}. You can restore it from the bin.`,
            })
          }
        />
      </div>
    </div>
  );
}
