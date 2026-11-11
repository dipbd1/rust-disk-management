import { useState } from "react";
import { categoryTextClass, liquidColors, nodeGlyph } from "../../lib/colors";
import { diskUsedRatio, formatBytes, formatShare } from "../../lib/format";
import { isDriveRoot } from "../../lib/paths";
import { sharePercent } from "../../lib/scale";
import type { FileNode } from "../../types/filesystem";
import { useFileStore } from "../../store/useFileStore";
import { useVisualizerStore } from "../visualizer/visualizerState";

interface ViewerInspectorProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function ViewerInspector({ collapsed, onToggle }: ViewerInspectorProps) {
  const graphView = useFileStore((state) => state.graphView);
  const focusedNodeId = useFileStore((state) => state.focusedNodeId);
  const selectedNodeId = useFileStore((state) => state.selectedNodeId);
  const nodes = useFileStore((state) => state.nodes);
  const drives = useFileStore((state) => state.drives);
  const activeDrive = useFileStore((state) => state.activeDrive);
  const progress = useFileStore((state) => state.progress);
  const scanStatus = useFileStore((state) => state.scanStatus);
  const stale = useFileStore((state) => state.stale);
  const focusNode = useFileStore((state) => state.focusNode);
  const reveal = useFileStore((state) => state.reveal);
  const copyNodePath = useFileStore((state) => state.copyNodePath);
  const requestTrash = useFileStore((state) => state.requestTrash);
  const hoveredNodeId = useVisualizerStore((state) => state.hoveredNodeId);
  const [copied, setCopied] = useState(false);

  const hub = graphView?.focus ?? (focusedNodeId ? nodes[focusedNodeId] : undefined);
  let activeNode: FileNode | undefined = hub;
  if (hoveredNodeId) {
    activeNode = nodes[hoveredNodeId] ?? graphView?.children.find((child) => child.id === hoveredNodeId) ?? hub;
  } else if (selectedNodeId) {
    activeNode = nodes[selectedNodeId] ?? graphView?.children.find((child) => child.id === selectedNodeId) ?? hub;
  }

  const drive = drives.find((item) => item.mount === activeDrive);
  const isRoot = activeNode ? isDriveRoot(activeNode.path) : false;
  const diskUsed = activeNode && isRoot ? diskUsedRatio(drive) : null;
  const isHub = activeNode && hub ? activeNode.id === hub.id : false;
  const share = activeNode ? sharePercent(activeNode.percentOfParent) : 0;
  const colors = activeNode ? liquidColors(activeNode) : { a: "#38bdf8", b: "#0284c7" };

  const handleCopy = async () => {
    if (!activeNode) return;
    await copyNodePath(activeNode.path);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-900/70" aria-label="Details">
      <header className="flex h-7 shrink-0 items-center border-b border-white/10">
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 items-center gap-1 px-2 text-left text-[11px] tracking-wide text-slate-400 uppercase"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand details" : "Collapse details"}
          onClick={onToggle}
        >
          <span className="grid h-4 w-4 shrink-0 place-items-center text-[10px]" aria-hidden>
            {collapsed ? "▸" : "▾"}
          </span>
          Details
        </button>
      </header>
      {collapsed || !activeNode ? (
        collapsed ? null : <p className="px-3 py-4 text-sm text-slate-500">Choose a drive to scan.</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-2 text-xs text-slate-200">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-sm font-bold"
              style={{ backgroundColor: `${colors.a}20`, color: colors.a }}
            >
              {nodeGlyph(activeNode)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white" title={activeNode.name}>
                {activeNode.name}
              </p>
              <p className="text-[11px] text-slate-400 capitalize">
                {isHub ? "Focused folder" : activeNode.kind === "folder" ? "Folder" : "File"}
              </p>
            </div>
            <span className={`shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase ${categoryTextClass(activeNode)}`}>
              {activeNode.category}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold tracking-tight text-white">{formatBytes(activeNode.sizeBytes)}</span>
            <span className="font-mono text-xs font-semibold text-cyan-300">{formatShare(activeNode.percentOfParent, diskUsed)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(3, Math.min(100, share))}%`,
                background: `linear-gradient(90deg, ${colors.a}, ${colors.b})`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Direct contents</span>
            <span className="font-mono font-medium text-slate-200">{activeNode.childCount.toLocaleString()} items</span>
          </div>
          <div className="truncate rounded-md bg-black/30 px-2 py-1 font-mono text-[10px] text-slate-400" title={activeNode.path}>
            {activeNode.path}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {activeNode.kind === "folder" && !isHub ? (
              <button
                type="button"
                onClick={() => void focusNode(activeNode.id)}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-cyan-400/50 bg-cyan-500/20 py-1.5 font-medium text-cyan-200 hover:bg-cyan-500/30"
                title="Enter this folder"
              >
                Enter
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void reveal(activeNode.path)}
              className="flex flex-1 items-center justify-center rounded-md border border-white/10 bg-white/5 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              title="Reveal in Windows Explorer"
            >
              Reveal
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              title="Copy full path"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            {!isRoot ? (
              <button
                type="button"
                onClick={() => requestTrash(activeNode.path)}
                className="flex items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-red-300 hover:bg-red-500/20"
                title="Move to Recycle Bin"
              >
                Trash
              </button>
            ) : null}
          </div>
          {scanStatus === "scanning" && progress ? (
            <div className="rounded-md border border-cyan-400/20 bg-cyan-950/40 p-2 text-[11px] text-cyan-200">
              <div className="flex justify-between font-mono">
                <span>Scanning</span>
                <span>{progress.scannedCount.toLocaleString()}</span>
              </div>
              <div className="truncate text-[10px] text-cyan-300/70">{progress.currentPath}</div>
            </div>
          ) : null}
          {stale ? <p className="text-amber-200">Disk changed. Rescan to refresh totals.</p> : null}
        </div>
      )}
    </section>
  );
}
