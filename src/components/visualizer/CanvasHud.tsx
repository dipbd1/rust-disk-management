import { useMemo, useState } from "react";
import { formatBytes } from "../../lib/format";
import { HEAVY_FILE_BYTES } from "../../lib/limits";
import { useFileStore } from "../../store/useFileStore";
import { useVisualizerStore } from "./visualizerState";

export function CanvasHud() {
  const graphView = useFileStore((state) => state.graphView);
  const activeDrive = useFileStore((state) => state.activeDrive);
  const focusNode = useFileStore((state) => state.focusNode);

  const categoryFilter = useVisualizerStore((state) => state.categoryFilter);
  const setCategoryFilter = useVisualizerStore((state) => state.setCategoryFilter);
  const triggerResetCamera = useVisualizerStore((state) => state.triggerResetCamera);

  const [showHelp, setShowHelp] = useState(false);

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

  const hubLabel = graphView?.focus.name || activeDrive || "C:";

  return (
    /* Top Bar Overlay: HUB on left, Category Filters in center, '?' help on right */
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-3">
      {/* Left: HUB pill */}
      <div className="pointer-events-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (graphView?.focus.path) {
              void focusNode(graphView.focus.path);
            }
            triggerResetCamera();
          }}
          className="flex items-center gap-2 rounded-full border border-cyan-500/30 bg-[#0B132B]/85 px-3 py-1.5 text-xs font-semibold text-cyan-300 shadow-lg shadow-cyan-950/40 backdrop-blur-md transition-all hover:border-cyan-400 hover:bg-cyan-950/40 hover:text-white"
          title="Reset focus to HUB center"
        >
          <span className="text-[10px] font-bold tracking-wider text-cyan-400 uppercase">HUB</span>
          <span className="text-white">{hubLabel}</span>
        </button>
      </div>

      {/* Center: Category Filter Chips sent to the Top */}
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
      <div className="pointer-events-auto relative shrink-0">
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#0A0F1D]/85 text-xs font-bold text-slate-300 shadow-xl backdrop-blur-md transition-all hover:border-cyan-400 hover:bg-cyan-950/40 hover:text-cyan-200"
          title="Navigation Manual & Controls"
        >
          ?
        </button>

        {/* Navigation Manual Floating Card */}
        {showHelp && (
          <div className="absolute right-0 top-10 z-30 w-72 rounded-2xl border border-white/10 bg-[#0A0F1D]/95 p-3.5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-bold text-cyan-300">
                  ?
                </span>
                <h4 className="text-xs font-semibold text-white">Navigation Manual</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-2.5 space-y-2 text-xs">
              <div className="flex items-start gap-2.5 rounded-xl bg-white/5 p-2">
                <span className="text-sm">🎯</span>
                <div>
                  <div className="font-semibold text-slate-100">Click Ball</div>
                  <div className="text-[11px] text-slate-400">Selects and brings folder smoothly to center</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl bg-white/5 p-2">
                <span className="text-sm">🖱️</span>
                <div>
                  <div className="font-semibold text-slate-100">Drag Canvas</div>
                  <div className="text-[11px] text-slate-400">Click &amp; drag anywhere (or Space + Drag) to pan</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl bg-white/5 p-2">
                <span className="text-sm">🔍</span>
                <div>
                  <div className="font-semibold text-slate-100">Scroll Wheel</div>
                  <div className="text-[11px] text-slate-400">Zoom in/out smoothly centered at your cursor</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl bg-white/5 p-2">
                <span className="text-sm">💡</span>
                <div>
                  <div className="font-semibold text-slate-100">Hover for Details</div>
                  <div className="text-[11px] text-slate-400">Inspect folder &amp; file counts, type, and size</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
