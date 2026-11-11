import { OrganicGraph2D } from "./OrganicGraph2D";
import { CanvasHud } from "./CanvasHud";

export function GraphCanvas() {
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden select-none bg-[#070A12]">
      <OrganicGraph2D />
      <CanvasHud />
    </div>
  );
}
