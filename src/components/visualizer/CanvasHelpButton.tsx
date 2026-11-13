import { useState } from "react";

export function CanvasHelpButton() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="pointer-events-auto relative shrink-0">
      <button
        type="button"
        onClick={() => setShowHelp((open) => !open)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#0A0F1D]/85 text-xs font-bold text-slate-300 shadow-xl backdrop-blur-md transition-all hover:border-cyan-400 hover:bg-cyan-950/40 hover:text-cyan-200"
        title="Navigation Manual & Controls"
        aria-expanded={showHelp}
        aria-label="Navigation Manual"
      >
        ?
      </button>

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
              aria-label="Close navigation manual"
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
              <span className="text-sm">⬆️</span>
              <div>
                <div className="font-semibold text-slate-100">Go Up One Level</div>
                <div className="text-[11px] text-slate-400">Click ↑ Up, a path crumb, or press Alt + ↑</div>
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
  );
}
