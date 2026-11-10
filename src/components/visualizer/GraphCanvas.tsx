import { OrganicGraph2D } from "./OrganicGraph2D";
import { CanvasHud } from "./CanvasHud";
import { ViewerInspector } from "./ViewerInspector";

export function GraphCanvas() {
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden select-none bg-[#070A12]">
      {/* 2D Organic Fluid Balls Canvas Engine */}
      <OrganicGraph2D />

      {/* Futuristic Floating HUD Suite matching the reference image */}
      <CanvasHud />

      {/* Optional Compact Node Inspector */}
      <ViewerInspector />
    </div>
  );
}
