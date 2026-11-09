import { useRef, useState, type PointerEvent } from "react";
import { FileListView } from "../explorer/FileListView";
import { VirtualFileTree } from "../explorer/VirtualFileTree";
import { GraphCanvas } from "../visualizer/GraphCanvas";

export function SplitWorkspace() {
  const [left, setLeft] = useState(35);
  const drag = useRef<number | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current !== event.pointerId) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const next = ((event.clientX - bounds.left) / bounds.width) * 100;
    setLeft(Math.min(58, Math.max(22, next)));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current === event.pointerId) drag.current = null;
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-col border-r border-white/10" style={{ width: `${left}%` }}>
        <div className="min-h-0 flex-1 border-b border-white/10">
          <VirtualFileTree />
        </div>
        <div className="min-h-0 flex-1">
          <FileListView />
        </div>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize explorer"
        className="w-1.5 shrink-0 cursor-col-resize bg-white/5 touch-none hover:bg-cyan-300/40"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="min-h-0 min-w-0 flex-1">
        <GraphCanvas />
      </div>
    </div>
  );
}
