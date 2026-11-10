import { useMemo, useState } from "react";
import { formatBytes } from "../../lib/format";
import { HEAVY_FILE_BYTES } from "../../lib/limits";
import { useFileStore } from "../../store/useFileStore";
import { useVisualizerStore } from "./visualizerState";

export function CanvasHud() {
  const graphView = useFileStore((state) => state.graphView);
  const activeDrive = useFileStore((state) => state.activeDrive);
  const focusNode = useFileStore((state) => state.focusNode);

  const autoOrbit = useVisualizerStore((state) => state.autoOrbit);
  const toggleAutoOrbit = useVisualizerStore((state) => state.toggleAutoOrbit);
  const categoryFilter = useVisualizerStore((state) => state.categoryFilter);
  const setCategoryFilter = useVisualizerStore((state) => state.setCategoryFilter);
  const triggerResetCamera = useVisualizerStore((state) => state.triggerResetCamera);

  const [physicsEnabled, setPhysicsEnabled] = useState(true);
  const [showPhysicsInfo, setShowPhysicsInfo] = useState(false);

  // Compute live counts and size for bottom HUD pills
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
    <>
      {/* Top Bar Overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-3">
        {/* Left: HUB pill */}
        <div className="pointer-events-auto flex items-center gap-2">
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

        {/* Right: Controls matching reference image */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0A0F1D]/85 p-1 shadow-2xl backdrop-blur-md">
          {/* Zoom */}
          <button
            type="button"
            onClick={triggerResetCamera}
            className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
            title="Recenter & Reset Zoom"
          >
            <svg className="h-3.5 w-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
            <span>Zoom</span>
          </button>

          {/* Pan */}
          <button
            type="button"
            onClick={triggerResetCamera}
            className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
            title="Pan mode (Click & Drag or Space + Drag)"
          >
            <svg className="h-3.5 w-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span>Pan</span>
          </button>

          {/* Physics Engine with info tooltip */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPhysicsEnabled(!physicsEnabled)}
              className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all ${
                physicsEnabled
                  ? "border border-cyan-500/40 bg-cyan-500/15 text-cyan-200"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
              title="Toggle Organic Repulsion Physics"
            >
              <svg className="h-3.5 w-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Physics Engine</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPhysicsInfo(!showPhysicsInfo);
                }}
                className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/10 text-[9px] text-slate-300 hover:bg-cyan-400 hover:text-black"
              >
                i
              </span>
            </button>
            {showPhysicsInfo && (
              <div className="absolute right-0 top-9 w-60 rounded-xl border border-white/10 bg-slate-900/95 p-2.5 text-[11px] text-slate-300 shadow-2xl backdrop-blur-md">
                Active organic repulsion physics maintains fluid distance and radial orbits between all nodes and satellite clusters.
              </div>
            )}
          </div>

          {/* Layout: Organic Node Tree pill */}
          <div className="flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 text-xs text-slate-300">
            <span className="text-slate-400">Layout:</span>
            <span className="font-semibold text-cyan-300">Organic Node Tree</span>
            <svg className="ml-1 h-3 w-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
            </svg>
          </div>

          {/* 2D Graph badge */}
          <div className="flex h-7 items-center gap-1.5 rounded-full border border-cyan-400/50 bg-cyan-500/20 px-2.5 text-xs font-semibold text-cyan-200 shadow-sm">
            <span>2D Graph</span>
          </div>

          {/* Auto-Orbit toggle */}
          <button
            type="button"
            onClick={toggleAutoOrbit}
            className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all ${
              autoOrbit
                ? "border border-cyan-400/60 bg-cyan-500/25 text-cyan-100 shadow-lg shadow-cyan-500/20"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
            title="Toggle Continuous Slow Auto-Orbit"
          >
            <span
              className={`h-2 w-2 rounded-full transition-all ${
                autoOrbit ? "bg-cyan-400 shadow-[0_0_8px_#00F0FF] animate-pulse" : "bg-slate-500"
              }`}
            />
            <span>Auto-Orbit</span>
          </button>
        </div>
      </div>

      {/* Bottom Floating Capsule HUD matching the Reference Image */}
      {stats && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-3 rounded-full border border-white/10 bg-[#0B1020]/90 px-4 py-2 text-xs text-slate-200 shadow-2xl backdrop-blur-lg">
            {/* Filter Category Chips */}
            <div className="flex items-center gap-2">
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

            {/* Vertical Divider */}
            <div className="h-4 w-px bg-white/15" />

            {/* Action Interaction Tips */}
            <div className="flex items-center gap-4 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-200">Click ball</span>
                <span>to target &amp; zoom</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-200">Space + Drag</span>
                <span>to pan</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-200">Double-click</span>
                <span>folder to enter</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
