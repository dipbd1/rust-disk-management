import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useFileStore } from "../../store/useFileStore";
import { ExplorerRow } from "./ExplorerRow";

export function FileListView() {
  const list = useFileStore((state) => state.list);
  const focusedNodeId = useFileStore((state) => state.focusedNodeId);
  const query = useFileStore((state) => state.query);
  const selectedNodeId = useFileStore((state) => state.selectedNodeId);
  const scanStatus = useFileStore((state) => state.scanStatus);
  const loadMoreList = useFileStore((state) => state.loadMoreList);
  const parentRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();
  const visible = list && list.parentPath === focusedNodeId && list.query === trimmed ? list : null;
  const showMore = visible !== null && !visible.complete;
  const count = (visible?.nodes.length ?? 0) + (showMore ? 1 : 0);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-900/70">
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-white/10 px-3 text-[11px] tracking-wide text-slate-400 uppercase">
        <span>This folder</span>
        {visible ? (
          <span className="tabular-nums normal-case">
            {visible.nodes.length.toLocaleString()} / {visible.total.toLocaleString()}
          </span>
        ) : null}
      </header>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        {!visible ? (
          <p className="px-3 py-4 text-sm text-slate-500">
            {focusedNodeId ? "Loading folder…" : scanStatus === "scanning" ? "Scanning this drive…" : "Open a folder to list its contents."}
          </p>
        ) : visible.nodes.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">{trimmed ? "No matching items." : "This folder is empty."}</p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const node = visible.nodes[item.index];
              const more = showMore && item.index === visible.nodes.length;
              return (
                <div
                  key={node?.id ?? "more"}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {node && !more ? (
                    <ExplorerRow node={node} depth={0} selected={selectedNodeId === node.id} expanded={false} showChevron={false} />
                  ) : (
                    <button
                      type="button"
                      className="h-8 w-full px-3 text-left text-xs text-cyan-200 hover:bg-white/5"
                      onClick={() => void loadMoreList()}
                    >
                      Load more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
