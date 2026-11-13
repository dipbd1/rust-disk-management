import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes } from "../../lib/format";
import type { FileNode } from "../../types/filesystem";

const ROW_HEIGHT = 36;

interface NodePageProps {
  nodes: FileNode[];
  total: number;
  empty: string;
  onOpen: (node: FileNode) => void;
  onLoadMore?: () => void;
}

export function NodePage({ nodes, total, empty, onOpen, onLoadMore }: NodePageProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const more = Boolean(onLoadMore) && nodes.length < total;
  const count = nodes.length + (more ? 1 : 0);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  if (nodes.length === 0) {
    return <p className="px-3 py-4 text-sm text-slate-500">{empty}</p>;
  }
  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const node = nodes[item.index];
          return (
            <div key={node?.id ?? "more"} className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${item.start}px)` }}>
              {node ? (
                <button type="button" className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm hover:bg-white/5" onClick={() => onOpen(node)} title={node.path}>
                  <span className="min-w-0 flex-1 truncate">{node.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">{formatBytes(node.sizeBytes)}</span>
                </button>
              ) : (
                <button type="button" className="h-9 w-full px-3 text-left text-xs text-cyan-200 hover:bg-white/5" onClick={onLoadMore}>
                  Load more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
