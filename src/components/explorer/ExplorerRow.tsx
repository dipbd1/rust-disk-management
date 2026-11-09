import { categoryTextClass, nodeGlyph } from "../../lib/colors";
import { formatBytes } from "../../lib/format";
import { sharePercent } from "../../lib/scale";
import type { FileNode } from "../../types/filesystem";
import { useFileStore } from "../../store/useFileStore";
import { NodeContextMenu } from "./NodeContextMenu";

interface ExplorerRowProps {
  node: FileNode;
  depth: number;
  selected: boolean;
  expanded: boolean;
  showChevron: boolean;
}

export function ExplorerRow({ node, depth, selected, expanded, showChevron }: ExplorerRowProps) {
  const selectNode = useFileStore((state) => state.selectNode);
  const focusNode = useFileStore((state) => state.focusNode);
  const toggleExpanded = useFileStore((state) => state.toggleExpanded);
  const width = `${sharePercent(node.percentOfParent)}%`;

  return (
    <NodeContextMenu node={node}>
      <div
        role="row"
        title={node.path}
        aria-selected={selected}
        aria-expanded={showChevron ? expanded : undefined}
        className={`flex h-8 cursor-pointer items-center gap-2 pr-2 text-sm select-none ${selected ? "bg-cyan-400/15" : "hover:bg-white/5"}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => selectNode(node.id)}
        onDoubleClick={() => {
          if (node.kind === "folder") void focusNode(node.id);
        }}
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
