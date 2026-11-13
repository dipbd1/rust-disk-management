import { useRef, useState, type PointerEvent } from "react";
import { DuplicatePanel } from "../explorer/DuplicatePanel";
import { GrowthPanel } from "../explorer/GrowthPanel";
import { PaneTabs } from "../explorer/PaneTabs";
import { ReclaimPanel } from "../explorer/ReclaimPanel";
import { LargestPanel, SearchPanel, TypesPanel } from "../explorer/SpacePanels";
import { VirtualFileTree } from "../explorer/VirtualFileTree";
import { useFileStore } from "../../store/useFileStore";
import { GraphCanvas } from "../visualizer/GraphCanvas";
import { ViewerInspector } from "./ViewerInspector";

const TREE_MIN_PX = 96;
const DETAILS_MIN_PX = 120;
const HANDLE_PX = 6;

export function SplitWorkspace() {
  const [left, setLeft] = useState(35);
  const [detailsRatio, setDetailsRatio] = useState(0.35);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const widthDrag = useRef<number | null>(null);
  const heightDrag = useRef<number | null>(null);
  const leftTab = useFileStore((state) => state.leftTab);

  const onWidthPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    widthDrag.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onWidthPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (widthDrag.current !== event.pointerId) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const next = ((event.clientX - bounds.left) / bounds.width) * 100;
    setLeft(Math.min(58, Math.max(22, next)));
  };
  const onWidthPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (widthDrag.current === event.pointerId) widthDrag.current = null;
  };

  const onHeightPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    heightDrag.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onHeightPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (heightDrag.current !== event.pointerId) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds || bounds.height <= 0) return;
    const available = bounds.height - HANDLE_PX;
    if (available <= TREE_MIN_PX) return;
    const maxDetails = available - TREE_MIN_PX;
    const minDetails = Math.min(DETAILS_MIN_PX, maxDetails);
    const fromBottom = bounds.bottom - event.clientY;
    const next = Math.min(maxDetails, Math.max(minDetails, fromBottom));
    setDetailsRatio(next / available);
  };
  const onHeightPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (heightDrag.current === event.pointerId) heightDrag.current = null;
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-col border-r border-white/10" style={{ width: `${left}%` }}>
        <div
          className="flex min-h-0 flex-col overflow-hidden"
          style={{ flex: detailsCollapsed ? "1 1 0%" : `${1 - detailsRatio} 1 0%` }}
        >
          <PaneTabs />
          <div className="flex min-h-0 flex-1 flex-col">
            {leftTab === "explorer" ? <VirtualFileTree /> : null}
            {leftTab === "largest" ? <LargestPanel /> : null}
            {leftTab === "search" ? <SearchPanel /> : null}
            {leftTab === "types" ? <TypesPanel /> : null}
            {leftTab === "reclaim" ? <ReclaimPanel /> : null}
            {leftTab === "duplicates" ? <DuplicatePanel /> : null}
            {leftTab === "growth" ? <GrowthPanel /> : null}
          </div>
        </div>
        {detailsCollapsed ? null : (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize details"
            className="h-1.5 shrink-0 cursor-row-resize bg-white/5 touch-none hover:bg-cyan-300/40"
            onPointerDown={onHeightPointerDown}
            onPointerMove={onHeightPointerMove}
            onPointerUp={onHeightPointerUp}
          />
        )}
        <div
          className={detailsCollapsed ? "h-7 shrink-0" : "min-h-0 overflow-hidden"}
          style={detailsCollapsed ? undefined : { flex: `${detailsRatio} 1 0%` }}
        >
          <ViewerInspector collapsed={detailsCollapsed} onToggle={() => setDetailsCollapsed((collapsed) => !collapsed)} />
        </div>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize explorer"
        className="w-1.5 shrink-0 cursor-col-resize bg-white/5 touch-none hover:bg-cyan-300/40"
        onPointerDown={onWidthPointerDown}
        onPointerMove={onWidthPointerMove}
        onPointerUp={onWidthPointerUp}
      />
      <div className="min-h-0 min-w-0 flex-1">
        <GraphCanvas />
      </div>
    </div>
  );
}
