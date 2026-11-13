import { AreaMap } from "./AreaMap";
import { OrganicGraph2D } from "./OrganicGraph2D";
import { CanvasHud } from "./CanvasHud";
import { useVisualizerStore } from "./visualizerState";

export function GraphCanvas() {
  const surface = useVisualizerStore((state) => state.surface);
  const toggleSurface = useVisualizerStore((state) => state.toggleSurface);
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden select-none bg-[#070A12]">
      {surface === "map" ? <AreaMap /> : <OrganicGraph2D />}
      <CanvasHud />
      <button
        type="button"
        className="absolute right-3 bottom-3 z-30 rounded-full border border-white/15 bg-[#0B1020]/90 px-3 py-1.5 text-xs text-slate-100 shadow-lg backdrop-blur"
        onClick={toggleSurface}
      >
        {surface === "map" ? "Liquid" : "Area map"}
      </button>
    </div>
  );
}
