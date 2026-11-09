import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useFileStore } from "../../store/useFileStore";
import { ExplorerRow } from "./ExplorerRow";
import { flattenFolders } from "./flattenTree";

export function VirtualFileTree() {
  const nodes = useFileStore((state) => state.nodes);
  const childPages = useFileStore((state) => state.childPages);
  const expandedIds = useFileStore((state) => state.expandedIds);
  const rootId = useFileStore((state) => state.rootId);
  const selectedNodeId = useFileStore((state) => state.selectedNodeId);
  const loadMoreTree = useFileStore((state) => state.loadMoreTree);
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(
    () => flattenFolders(rootId, nodes, childPages, expandedIds),
    [rootId, nodes, childPages, expandedIds],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-900/70">
      <header className="flex h-7 shrink-0 items-center border-b border-white/10 px-3 text-[11px] tracking-wide text-slate-400 uppercase">
        Folders
      </header>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">Choose a drive to scan.</p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <div
                  key={row.key}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {row.kind === "node" ? (
                    <ExplorerRow
                      node={row.node}
                      depth={row.depth}
                      selected={selectedNodeId === row.node.id}
                      expanded={expandedIds.includes(row.node.id) || expandedIds.includes(row.node.path)}
                      showChevron
                    />
                  ) : (
                    <button
                      type="button"
                      className="h-8 w-full px-3 text-left text-xs text-cyan-200 hover:bg-white/5"
                      style={{ paddingLeft: 8 + row.depth * 14 }}
                      onClick={() => void loadMoreTree(row.parentPath)}
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
