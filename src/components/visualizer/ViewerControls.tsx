import { useVisualizerStore, type LabelDensity } from "./visualizerState";

export function ViewerControls() {
  const viewMode = useVisualizerStore((state) => state.viewMode);
  const setViewMode = useVisualizerStore((state) => state.setViewMode);
  const autoOrbit = useVisualizerStore((state) => state.autoOrbit);
  const toggleAutoOrbit = useVisualizerStore((state) => state.toggleAutoOrbit);
  const labelMode = useVisualizerStore((state) => state.labelMode);
  const setLabelMode = useVisualizerStore((state) => state.setLabelMode);
  const triggerResetCamera = useVisualizerStore((state) => state.triggerResetCamera);

  const cycleLabels = () => {
    const sequence: LabelDensity[] = ["smart", "all", "minimal"];
    const nextIdx = (sequence.indexOf(labelMode) + 1) % sequence.length;
    setLabelMode(sequence[nextIdx]);
  };

  return (
    <div className="pointer-events-auto absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/75 p-1 shadow-xl backdrop-blur-md">
      {/* 3D Orbit / 2D Planar Toggle */}
      <button
        type="button"
        onClick={() => setViewMode(viewMode === "perspective" ? "top" : "perspective")}
        className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all ${
          viewMode === "top"
            ? "border border-cyan-400/50 bg-cyan-500/20 text-cyan-200"
            : "text-slate-300 hover:bg-white/10 hover:text-white"
        }`}
        title={viewMode === "perspective" ? "Switch to Top-down Planar view" : "Switch to 3D Orbit view"}
      >
        <span>{viewMode === "perspective" ? "3D" : "2D"}</span>
      </button>

      {/* Auto Orbit Toggle */}
      <button
        type="button"
        onClick={toggleAutoOrbit}
        className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all ${
          autoOrbit
            ? "border border-cyan-400/50 bg-cyan-500/20 text-cyan-200"
            : "text-slate-300 hover:bg-white/10 hover:text-white"
        }`}
        title="Ambient Cinema Auto-Orbit"
      >
        <span
          className={`h-2 w-2 rounded-full transition-colors ${
            autoOrbit ? "bg-cyan-400 animate-pulse" : "bg-slate-500"
          }`}
        />
        <span>Orbit</span>
      </button>

      {/* Label Density Cycle */}
      <button
        type="button"
        onClick={cycleLabels}
        className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
        title="Cycle Label Density (Smart / All / Minimal)"
      >
        <span className="text-[10px] text-slate-400 uppercase">Tags:</span>
        <span className="capitalize text-slate-200">{labelMode}</span>
      </button>

      {/* Reset Camera */}
      <button
        type="button"
        onClick={triggerResetCamera}
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition-all hover:bg-white/10 hover:text-white"
        title="Reset Camera Center"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </div>
  );
}
