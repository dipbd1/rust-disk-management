import { useEffect, useMemo } from "react";
import { formatBytes } from "../../lib/format";
import { HEAVY_FILE_BYTES } from "../../lib/limits";
import { breadcrumbs } from "../../lib/paths";
import { useFileStore } from "../../store/useFileStore";
import { CanvasBreadcrumbs } from "./CanvasBreadcrumbs";
import { CanvasHelpButton } from "./CanvasHelpButton";
import { useVisualizerStore } from "./visualizerState";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function CanvasHud() {
  const graphView = useFileStore((state) => state.graphView);
  const focusedNodeId = useFileStore((state) => state.focusedNodeId);
  const activeDrive = useFileStore((state) => state.activeDrive);
  const scanStatus = useFileStore((state) => state.scanStatus);
  const confirmPath = useFileStore((state) => state.confirmPath);
  const focusNode = useFileStore((state) => state.focusNode);

  const categoryFilter = useVisualizerStore((state) => state.categoryFilter);
  const setCategoryFilter = useVisualizerStore((state) => state.setCategoryFilter);
  const triggerResetCamera = useVisualizerStore((state) => state.triggerResetCamera);
  const triggerTreeReveal = useVisualizerStore((state) => state.triggerTreeReveal);

  // Compute live counts and size for filter pills
  const stats = useMemo(() => {
    if (!graphView) return null;
    const children = graphView.children;
    const items = graphView.other ? [...children, graphView.other] : children;

    let totalBytes = 0;
    let folderCount = 0;
    let folderBytes = 0;
    let codeCount = 0;
    let codeBytes = 0;
    let heavyCount = 0;
    let heavyBytes = 0;
    let otherCount = 0;
    let otherBytes = 0;

    for (const item of items) {
      totalBytes += item.sizeBytes;
      if (item.kind === "folder") {
        folderCount++;
        folderBytes += item.sizeBytes;
      } else if (item.sizeBytes >= HEAVY_FILE_BYTES) {
        heavyCount++;
        heavyBytes += item.sizeBytes;
      } else if (item.category === "code") {
        codeCount++;
        codeBytes += item.sizeBytes;
      } else {
        otherCount++;
        otherBytes += item.sizeBytes;
      }
    }

    return {
      all: { count: items.length, bytes: totalBytes },
      folders: { count: folderCount, bytes: folderBytes },
      code: { count: codeCount, bytes: codeBytes },
      heavy: { count: heavyCount, bytes: heavyBytes },
      other: { count: otherCount, bytes: otherBytes },
    };
  }, [graphView]);

  const activePath = graphView?.focus.path ?? focusedNodeId ?? "";
  const crumbs = useMemo(() => (activePath ? breadcrumbs(activePath) : []), [activePath]);
  const parentCrumb = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  const isScanning = scanStatus === "scanning";
  const canGoUp = Boolean(parentCrumb) && !isScanning;
  const hubLabel = graphView?.focus.name || activeDrive || "C:";

  useEffect(() => {
    if (!canGoUp || !parentCrumb || confirmPath) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;
      const isUpShortcut =
        (event.altKey && event.key === "ArrowUp") || (!event.altKey && event.key === "Backspace");
      if (!isUpShortcut) return;
      event.preventDefault();
      triggerTreeReveal();
      void focusNode(parentCrumb.path);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canGoUp, parentCrumb, confirmPath, focusNode, triggerTreeReveal]);

  return (
    <>
      {/* Top Bar Overlay: Up + HUB on left, Category Filters in center, '?' help on right */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-3">
        {/* Left: Go Up One Level + HUB pill */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={!canGoUp}
            onClick={() => {
              if (!parentCrumb || isScanning) return;
              triggerTreeReveal();
              void focusNode(parentCrumb.path);
            }}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md transition-all ${
              canGoUp
                ? "border-cyan-500/35 bg-[#0B132B]/85 text-cyan-200 shadow-cyan-950/40 hover:border-cyan-400 hover:bg-cyan-950/50 hover:text-white active:scale-95"
                : "cursor-not-allowed border-white/10 bg-[#0B132B]/55 text-slate-500"
            }`}
            title={
              parentCrumb
                ? isScanning
                  ? "Wait for scan to finish"
                  : `Go up to ${parentCrumb.label || parentCrumb.path} (Alt + ↑)`
                : "Already at drive root"
            }
            aria-label={parentCrumb ? `Go up to ${parentCrumb.label || parentCrumb.path}` : "At drive root"}
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 19V5m0 0l-6 6m6-6l6 6" />
            </svg>
            <span>Up</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (graphView?.focus.path) {
                triggerTreeReveal();
                void focusNode(graphView.focus.path);
              }
              triggerResetCamera();
            }}
            className="flex max-w-[180px] items-center gap-2 rounded-full border border-cyan-500/30 bg-[#0B132B]/85 px-3 py-1.5 text-xs font-semibold text-cyan-300 shadow-lg shadow-cyan-950/40 backdrop-blur-md transition-all hover:border-cyan-400 hover:bg-cyan-950/40 hover:text-white"
            title="Reset focus to HUB center"
          >
            <span className="shrink-0 text-[10px] font-bold tracking-wider text-cyan-400 uppercase">HUB</span>
            <span className="truncate text-white">{hubLabel}</span>
          </button>
        </div>

        {/* Center: Category Filter Chips */}
        {stats && (
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full border border-white/10 bg-[#0B1020]/90 px-3 py-1 text-xs text-slate-200 shadow-2xl backdrop-blur-lg">
            {/* All Items */}
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all ${
                categoryFilter === "all"
                  ? "border border-cyan-400/40 bg-cyan-500/20 text-cyan-100"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#00F0FF]" />
              <span className="font-medium text-slate-200">All Items</span>
              <span className="font-mono text-[10px] text-slate-400">{stats.all.count}</span>
              <span className="font-mono text-[10px] text-slate-400">{formatBytes(stats.all.bytes)}</span>
            </button>

            {/* Folders */}
            <button
              type="button"
              onClick={() => setCategoryFilter(categoryFilter === "folder" ? "all" : "folder")}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all ${
                categoryFilter === "folder"
                  ? "border border-teal-400/40 bg-teal-500/20 text-teal-100"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_6px_#2DD4BF]" />
              <span className="font-medium text-slate-200">Folders</span>
              <span className="font-mono text-[10px] text-slate-400">{stats.folders.count}</span>
              <span className="font-mono text-[10px] text-slate-400">{formatBytes(stats.folders.bytes)}</span>
            </button>

            {/* Code */}
            {stats.code.count > 0 && (
              <button
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === "code" ? "all" : "code")}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all ${
                  categoryFilter === "code"
                    ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-100"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34D399]" />
                <span className="font-medium text-slate-200">Code</span>
                <span className="font-mono text-[10px] text-slate-400">{stats.code.count}</span>
                <span className="font-mono text-[10px] text-slate-400">{formatBytes(stats.code.bytes)}</span>
              </button>
            )}

            {/* > 5GB */}
            {stats.heavy.count > 0 && (
              <button
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === "heavy" ? "all" : "heavy")}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all ${
                  categoryFilter === "heavy"
                    ? "border border-amber-400/40 bg-amber-500/20 text-amber-100"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_#FBBF24]" />
                <span className="font-medium text-slate-200">&gt; 5GB</span>
                <span className="font-mono text-[10px] text-slate-400">{stats.heavy.count}</span>
                <span className="font-mono text-[10px] text-slate-400">{formatBytes(stats.heavy.bytes)}</span>
              </button>
            )}

            {/* Other */}
            {stats.other.count > 0 && (
              <button
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === "other" ? "all" : "other")}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all ${
                  categoryFilter === "other"
                    ? "border border-purple-400/40 bg-purple-500/20 text-purple-100"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-purple-400 shadow-[0_0_6px_#C084FC]" />
                <span className="font-medium text-slate-200">Other</span>
              </button>
            )}
          </div>
        )}

        {/* Right: Clean '?' Navigation Manual Button */}
        <CanvasHelpButton />
      </div>

      {/* Bottom-Left: Interactive Path Breadcrumb Trail inside Canvas */}
      <CanvasBreadcrumbs
        crumbs={crumbs}
        disabled={isScanning}
        onSelect={(path) => {
          triggerTreeReveal();
          void focusNode(path);
        }}
      />
    </>
  );
}
