import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { categoryTextClass, nodeGlyph } from "../../lib/colors";
import { formatBytes } from "../../lib/format";
import { toWindowsPath } from "../../lib/paths";
import { useFileStore } from "../../store/useFileStore";
import type { FileNode, LargestSort } from "../../types/filesystem";
import { NodeContextMenu } from "./NodeContextMenu";

const ROW_HEIGHT = 44;

const SORTS: { id: LargestSort; label: string }[] = [
  { id: "size", label: "Size" },
  { id: "name", label: "Name" },
  { id: "folder", label: "Folder" },
];

interface Order {
  sort: LargestSort;
  descending: boolean;
}

function ready(status: string): boolean {
  return status === "ready" || status === "cancelled";
}

function parentLabel(path: string): string {
  const slash = toWindowsPath(path);
  const idx = slash.lastIndexOf("\\");
  if (idx < 0) return slash;
  if (idx === 2 && slash.charCodeAt(1) === 58) return slash.slice(0, idx + 1);
  if (idx === 0) return slash;
  return slash.slice(0, idx);
}

function rootShare(size: number, rootSize: number): string {
  if (rootSize <= 0 || size <= 0) return "0%";
  return `${Math.min(100, (size / rootSize) * 100)}%`;
}

export function LargestPanel() {
  const scanStatus = useFileStore((state) => state.scanStatus);
  const page = useFileStore((state) => state.largestPage);
  const loadLargest = useFileStore((state) => state.loadLargest);
  const loadMoreLargest = useFileStore((state) => state.loadMoreLargest);
  const openLocated = useFileStore((state) => state.openLocated);
  const selectedNodeId = useFileStore((state) => state.selectedNodeId);
  const rootSize = useFileStore((state) => (state.rootId ? (state.nodes[state.rootId]?.sizeBytes ?? 0) : 0));
  const [order, setOrder] = useState<Order>({ sort: "size", descending: true });
  const [revealed, setRevealed] = useState(false);
  const { sort, descending } = order;
  const showBar = revealed && ready(scanStatus);

  useEffect(() => {
    if (!revealed || !ready(scanStatus)) return;
    void loadLargest({ sort, descending });
  }, [revealed, scanStatus, sort, descending, loadLargest]);

  const scanMount = () => {
    const state = useFileStore.getState();
    if (state.scanStatus === "scanning") return;
    const mount = state.activeDrive ?? state.drives.find((drive) => !drive.isRemovable)?.mount ?? state.drives[0]?.mount ?? null;
    if (!mount) {
      useFileStore.setState({ toast: "No drive to scan." });
      return;
    }
    void state.scanDrive(mount);
  };

  const startScan = () => {
    setRevealed(true);
    if (ready(useFileStore.getState().scanStatus)) return;
    scanMount();
  };

  const chooseSort = (sort: LargestSort) => {
    setOrder((current) => {
      if (current.sort === sort) return { sort, descending: !current.descending };
      return { sort, descending: sort === "size" };
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showBar ? (
        <div className="flex shrink-0 items-center gap-2 px-2 py-2">
          <button
            type="button"
            disabled={scanStatus === "scanning"}
            className="h-7 shrink-0 rounded-md border border-cyan-300/40 px-2 text-xs text-cyan-100 disabled:opacity-40"
            onClick={scanMount}
          >
            Re-scan
          </button>
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {SORTS.map((chip) => {
              const active = sort === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={active}
                  className={`h-6 shrink-0 rounded-full px-2 text-[11px] ${active ? "bg-cyan-400/15 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}
                  onClick={() => chooseSort(chip.id)}
                >
                  {chip.label}
                  {active ? (descending ? " ↓" : " ↑") : ""}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 justify-center px-2 py-2">
          <button
            type="button"
            disabled={scanStatus === "scanning" && revealed}
            className="h-7 rounded-md border border-cyan-300/40 px-2 text-xs text-cyan-100 disabled:opacity-40"
            onClick={startScan}
          >
            Scan
          </button>
        </div>
      )}
      {!revealed ? null : scanStatus === "scanning" ? (
        <p className="px-3 py-2 text-sm text-slate-500">Scanning this drive.</p>
      ) : !ready(scanStatus) ? (
        <p className="px-3 py-2 text-sm text-slate-500">Scan a drive to list the largest files.</p>
      ) : !page ? (
        <p className="px-3 py-2 text-sm text-slate-500">Loading the largest files.</p>
      ) : (
        <LargestList
          nodes={page.nodes}
          total={page.total}
          rootSize={rootSize}
          selectedNodeId={selectedNodeId}
          onOpen={(node) => void openLocated(node)}
          onLoadMore={() => void loadMoreLargest({ sort, descending })}
        />
      )}
    </div>
  );
}

function LargestList({
  nodes,
  total,
  rootSize,
  selectedNodeId,
  onOpen,
  onLoadMore,
}: {
  nodes: FileNode[];
  total: number;
  rootSize: number;
  selectedNodeId: string | null;
  onOpen: (node: FileNode) => void;
  onLoadMore: () => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const more = nodes.length < total;
  const virtualizer = useVirtualizer({
    count: nodes.length + (more ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  if (nodes.length === 0) {
    return <p className="px-3 py-2 text-sm text-slate-500">No files in this scan.</p>;
  }
  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const node = nodes[item.index];
          return (
            <div key={node?.id ?? "more"} className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${item.start}px)` }}>
              {node ? (
                <LargestRow node={node} rootSize={rootSize} selected={node.id === selectedNodeId} onOpen={onOpen} />
              ) : (
                <button type="button" className="h-11 w-full px-3 text-left text-xs text-cyan-200 hover:bg-white/5" onClick={onLoadMore}>
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

function LargestRow({
  node,
  rootSize,
  selected,
  onOpen,
}: {
  node: FileNode;
  rootSize: number;
  selected: boolean;
  onOpen: (node: FileNode) => void;
}) {
  return (
    <NodeContextMenu node={node}>
      <button
        type="button"
        title={node.path}
        aria-selected={selected}
        className={`flex h-11 w-full items-center gap-2 px-2 text-left text-sm select-none ${selected ? "bg-cyan-400/15" : "hover:bg-white/5"}`}
        onClick={() => onOpen(node)}
      >
        <span className={`w-4 shrink-0 text-center ${categoryTextClass(node)}`}>{nodeGlyph(node)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{node.name}</span>
          <span className="block truncate text-xs text-slate-500">{parentLabel(node.path)}</span>
        </span>
        <span className="h-1 w-12 shrink-0 overflow-hidden rounded bg-white/10">
          <span className="block h-full bg-cyan-300/80" style={{ width: rootShare(node.sizeBytes, rootSize) }} />
        </span>
        <span className="w-16 shrink-0 text-right text-xs text-slate-400 tabular-nums">{formatBytes(node.sizeBytes)}</span>
      </button>
    </NodeContextMenu>
  );
}
