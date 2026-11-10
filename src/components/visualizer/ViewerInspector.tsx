import { useState } from "react";
import { categoryTextClass, liquidColors, nodeGlyph } from "../../lib/colors";
import { diskUsedRatio, formatBytes, formatShare } from "../../lib/format";
import { isDriveRoot } from "../../lib/paths";
import { sharePercent } from "../../lib/scale";
import type { FileNode } from "../../types/filesystem";
import { useFileStore } from "../../store/useFileStore";
import { useVisualizerStore } from "./visualizerState";

export function ViewerInspector() {
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
  const [collapsed, setCollapsed] = useState(true);

  // Determine active inspect target: hovered -> selected -> focus hub
  const hub = graphView?.focus ?? (focusedNodeId ? nodes[focusedNodeId] : undefined);
  let activeNode: FileNode | undefined = hub;

  if (hoveredNodeId) {
    activeNode = nodes[hoveredNodeId] ?? graphView?.children.find((c) => c.id === hoveredNodeId) ?? hub;
  } else if (selectedNodeId) {
    activeNode = nodes[selectedNodeId] ?? graphView?.children.find((c) => c.id === selectedNodeId) ?? hub;
  }

  const drive = drives.find((item) => item.mount === activeDrive);
  const isRoot = activeNode ? isDriveRoot(activeNode.path) : false;
  const diskUsed = activeNode && isRoot ? diskUsedRatio(drive) : null;
  const isHub = activeNode && hub && activeNode.id === hub.id;
  const share = activeNode ? sharePercent(activeNode.percentOfParent) : 0;
  const colors = activeNode ? liquidColors(activeNode) : { a: "#38bdf8", b: "#0284c7" };

  const handleCopy = async () => {
    if (!activeNode) return;
    await copyNodePath(activeNode.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="pointer-events-auto absolute right-3 bottom-3 z-10 flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/80 px-3 text-xs text-slate-300 shadow-xl backdrop-blur-md transition-all hover:border-cyan-400 hover:text-white"
        title="Open Details Inspector"
      >
        <span className="h-2 w-2 rounded-full bg-cyan-400" />
        <span>Inspect</span>
      </button>
    );
  }

  return (
    <aside className="pointer-events-auto absolute right-3 bottom-3 z-10 w-80 rounded-2xl border border-white/10 bg-slate-900/85 p-3.5 text-xs text-slate-200 shadow-2xl backdrop-blur-md">
      {/* Header with Glyph, Name, Role Badge and Close Button */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 text-base font-bold`}
            style={{ backgroundColor: `${colors.a}20`, color: colors.a }}
          >
            {activeNode ? nodeGlyph(activeNode) : "▣"}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-white" title={activeNode?.name ?? "No folder"}>
              {activeNode?.name ?? "No folder"}
            </h3>
            <p className="text-[11px] capitalize text-slate-400">
              {isHub ? "Center Hub" : activeNode?.kind === "folder" ? "Child Folder" : "File Item"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {activeNode && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${categoryTextClass(activeNode)} bg-white/5`}>
              {activeNode.category}
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            title="Close Inspector"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Metrics Section */}
      {activeNode ? (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-white">{formatBytes(activeNode.sizeBytes)}</span>
            <span className="font-mono text-xs font-semibold text-cyan-300">
              {formatShare(activeNode.percentOfParent, diskUsed)}
            </span>
          </div>

          {/* Visual Percentage Bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(3, Math.min(100, share))}%`,
                background: `linear-gradient(90deg, ${colors.a}, ${colors.b})`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span>Direct Contents</span>
            <span className="font-mono font-medium text-slate-200">{activeNode.childCount.toLocaleString()} items</span>
          </div>

          {/* Path Display */}
          <div className="truncate rounded-md bg-black/30 px-2 py-1 font-mono text-[10px] text-slate-400" title={activeNode.path}>
            {activeNode.path}
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex items-center gap-1.5 pt-1">
            {activeNode.kind === "folder" && !isHub && (
              <button
                type="button"
                onClick={() => void focusNode(activeNode.id)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-cyan-400/50 bg-cyan-500/20 py-1.5 font-medium text-cyan-200 hover:bg-cyan-500/30"
                title="Enter this folder as center hub"
              >
                <span>Enter</span>
                <span className="text-xs">→</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void reveal(activeNode.path)}
              className="flex flex-1 items-center justify-center rounded-lg border border-white/10 bg-white/5 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              title="Reveal in Windows Explorer"
            >
              Reveal
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              title="Copy Full Path"
            >
              {copied ? "✓" : "Copy"}
            </button>
            {!isRoot && (
              <button
                type="button"
                onClick={() => requestTrash(activeNode.path)}
                className="flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-red-300 hover:bg-red-500/20"
                title="Move to Recycle Bin"
              >
                Trash
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Progress & Stale alerts */}
      {scanStatus === "scanning" && progress && (
        <div className="mt-2.5 rounded-lg border border-cyan-400/20 bg-cyan-950/40 p-2 text-[11px] text-cyan-200">
          <div className="flex justify-between font-mono">
            <span>Scanning...</span>
            <span>{progress.scannedCount.toLocaleString()}</span>
          </div>
          <div className="truncate text-[10px] text-cyan-300/70">{progress.currentPath}</div>
        </div>
      )}
      {stale && <p className="mt-2 text-amber-200">Disk changed. Rescan to refresh totals.</p>}
    </aside>
  );
}
