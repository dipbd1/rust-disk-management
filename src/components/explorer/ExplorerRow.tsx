import { categoryTextClass, nodeGlyph } from "../../lib/colors";
import { formatBytes } from "../../lib/format";
import { SATELLITE_CHILDREN, SATELLITE_PARENTS } from "../../lib/limits";
import { sharePercent } from "../../lib/scale";
import type { FileNode } from "../../types/filesystem";
import { useFileStore } from "../../store/useFileStore";
import { useVisualizerStore } from "../visualizer/visualizerState";
import { NodeContextMenu } from "./NodeContextMenu";

const SCAN_WAIT = "Scanning in progress. Please wait.";

interface ExplorerRowProps {
  node: FileNode;
  depth: number;
  selected: boolean;
  expanded: boolean;
  showChevron: boolean;
}

function matches(node: FileNode, id: string | null | undefined): boolean {
  if (!id) return false;
  return node.id === id || node.path === id;
}

/** The open hub, a direct child, or a file moon already drawn beside a child folder. */
function sameLevel(node: FileNode): boolean {
  const state = useFileStore.getState();
  const focus = state.graphView?.focus;
  if (matches(node, state.focusedNodeId) || matches(node, focus?.id) || matches(node, focus?.path)) return true;
  const focusIds = [state.focusedNodeId, focus?.id, focus?.path];
  if (node.parentId && focusIds.includes(node.parentId)) return true;
  if (node.kind !== "file") return false;
  const folders = (state.graphView?.children ?? []).filter((child) => child.kind === "folder").slice(0, SATELLITE_PARENTS);
  for (const folder of folders) {
    if (node.parentId !== folder.id && node.parentId !== folder.path) continue;
    const page = state.childPages[folder.path] ?? state.childPages[folder.id];
    const moons = page?.nodes.slice(0, SATELLITE_CHILDREN) ?? [];
    if (moons.some((moon) => moon.id === node.id || moon.path === node.path)) return true;
  }
  return false;
}

export function ExplorerRow({ node, depth, selected, expanded, showChevron }: ExplorerRowProps) {
  const selectNode = useFileStore((state) => state.selectNode);
  const focusNode = useFileStore((state) => state.focusNode);
  const toggleExpanded = useFileStore((state) => state.toggleExpanded);
  const width = `${sharePercent(node.percentOfParent)}%`;

  const openNode = () => {
    if (node.kind !== "folder" && node.kind !== "file") return;
    if (useFileStore.getState().scanStatus === "scanning") {
      useFileStore.setState({ toast: SCAN_WAIT });
      return;
    }
    void focusNode(node.id);
  };

  const selectInPlace = () => {
    if (node.kind !== "folder" && node.kind !== "file") {
      selectNode(node.id);
      return;
    }
    const state = useFileStore.getState();
    if (state.scanStatus === "scanning") {
      selectNode(node.id);
      if (!matches(node, state.focusedNodeId)) useFileStore.setState({ toast: SCAN_WAIT });
      return;
    }
    selectNode(node.id);
    if (sameLevel(node)) {
      useVisualizerStore.getState().triggerCenterNode(node.id);
      return;
    }
    if (node.kind === "folder") {
      void focusNode(node.id);
      return;
    }
    if (node.parentId) {
      void focusNode(node.parentId).then(() => {
        useVisualizerStore.getState().triggerCenterNode(node.id);
      });
    }
  };

  return (
    <NodeContextMenu node={node}>
      <div
        role="row"
        title={node.path}
        aria-selected={selected}
        aria-expanded={showChevron ? expanded : undefined}
        className={`flex h-8 cursor-pointer items-center gap-2 pr-2 text-sm select-none ${selected ? "bg-cyan-400/15" : "hover:bg-white/5"}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={selectInPlace}
        onDoubleClick={openNode}
      >
        {showChevron ? (
          <button
            type="button"
            className="grid h-4 w-4 shrink-0 place-items-center text-[10px] text-slate-400"
            aria-label={expanded ? "Collapse folder" : "Expand folder"}
            onClick={(event) => {
              event.stopPropagation();
              void toggleExpanded(node.id);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className={`w-4 shrink-0 text-center ${categoryTextClass(node)}`}>{nodeGlyph(node)}</span>
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="h-1 w-12 shrink-0 overflow-hidden rounded bg-white/10">
          <span className="block h-full bg-cyan-300/80" style={{ width }} />
        </span>
        <span className="w-16 shrink-0 text-right text-xs text-slate-400 tabular-nums">{formatBytes(node.sizeBytes)}</span>
      </div>
    </NodeContextMenu>
  );
}
