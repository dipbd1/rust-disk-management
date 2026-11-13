import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ancestorChain } from "../../lib/paths";
import { useFileStore } from "../../store/useFileStore";
import { useVisualizerStore } from "../visualizer/visualizerState";
import { ExplorerRow } from "./ExplorerRow";
import { flattenTree } from "./flattenTree";

const ROW_HEIGHT = 32;

export function VirtualFileTree() {
  const nodes = useFileStore((state) => state.nodes);
  const childPages = useFileStore((state) => state.childPages);
  const expandedIds = useFileStore((state) => state.expandedIds);
  const rootId = useFileStore((state) => state.rootId);
  const focusedNodeId = useFileStore((state) => state.focusedNodeId);
  const selectedNodeId = useFileStore((state) => state.selectedNodeId);
  const loadMoreTree = useFileStore((state) => state.loadMoreTree);
  const treeRevealTrigger = useVisualizerStore((state) => state.treeRevealTrigger);
  const parentRef = useRef<HTMLDivElement>(null);
  const pendingRevealRef = useRef(false);
  const prevSignalRef = useRef({ focusedNodeId: null as string | null, treeRevealTrigger: 0 });
  const rows = useMemo(
    () => flattenTree(rootId, nodes, childPages, expandedIds),
    [rootId, nodes, childPages, expandedIds],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const revealTarget = useMemo(() => {
    const selectedNode = selectedNodeId ? nodes[selectedNodeId] : undefined;
    if (selectedNode) {
      const fallbackId =
        selectedNode.kind === "folder" ? null : (selectedNode.parentId ?? focusedNodeId ?? null);
      return { id: selectedNode.id, fallbackId };
    }
    if (selectedNodeId) {
      const chain = ancestorChain(selectedNodeId);
      return {
        id: selectedNodeId,
        fallbackId: chain.length > 1 ? chain[chain.length - 2] : null,
      };
    }
    return { id: focusedNodeId ?? null, fallbackId: null };
  }, [selectedNodeId, nodes, focusedNodeId]);

  useEffect(() => {
    const prev = prevSignalRef.current;
    if (prev.focusedNodeId !== focusedNodeId || prev.treeRevealTrigger !== treeRevealTrigger) {
      prevSignalRef.current = { focusedNodeId, treeRevealTrigger };
      pendingRevealRef.current = true;
    }
  }, [focusedNodeId, treeRevealTrigger]);

  useEffect(() => {
    if (!pendingRevealRef.current || !revealTarget.id) return;

    const match = (id: string) =>
      rows.findIndex((row) => row.kind === "node" && (row.node.id === id || row.node.path === id));
    let index = match(revealTarget.id);
    if (index === -1 && revealTarget.fallbackId) index = match(revealTarget.fallbackId);
    if (index === -1) {
      // Wait for ancestor childPages to finish loading before clearing the pending reveal.
      const anchor = revealTarget.fallbackId ?? revealTarget.id;
      const strictAncestors = ancestorChain(anchor).slice(0, -1);
      const allAncestorsLoaded = strictAncestors.every((path) => Boolean(childPages[path]));
      if (allAncestorsLoaded) {
        pendingRevealRef.current = false;
      }
      return;
    }

    pendingRevealRef.current = false;
    const el = parentRef.current;
    if (!el || el.clientHeight <= 0) return;

    const itemStart = index * ROW_HEIGHT;
    const itemEnd = itemStart + ROW_HEIGHT;
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;
    if (itemStart < viewTop || itemEnd > viewBottom) {
      virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });
    }
  }, [rows, revealTarget, childPages, virtualizer, focusedNodeId, treeRevealTrigger]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-900/70">
      <header className="flex h-7 shrink-0 items-center border-b border-white/10 px-3 text-[11px] tracking-wide text-slate-400 uppercase">
        Explorer
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
                      showChevron={row.node.kind === "folder"}
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
