import { diskUsedRatio, formatBytes, formatShare } from "../../lib/format";
import { isDriveRoot } from "../../lib/paths";
import { useFileStore } from "../../store/useFileStore";

export function GraphHud() {
  const graphView = useFileStore((state) => state.graphView);
  const focusedNodeId = useFileStore((state) => state.focusedNodeId);
  const nodes = useFileStore((state) => state.nodes);
  const drives = useFileStore((state) => state.drives);
  const activeDrive = useFileStore((state) => state.activeDrive);
  const progress = useFileStore((state) => state.progress);
  const scanStatus = useFileStore((state) => state.scanStatus);
  const stale = useFileStore((state) => state.stale);
  const focus = graphView?.focus ?? (focusedNodeId ? nodes[focusedNodeId] : undefined);
  const drive = drives.find((item) => item.mount === activeDrive);
  const diskUsed = focus && isDriveRoot(focus.path) ? diskUsedRatio(drive) : null;

  return (
    <aside className="pointer-events-none absolute right-3 bottom-3 z-10 w-64 rounded-xl border border-white/10 bg-slate-900/70 p-3 text-xs text-slate-200 shadow-xl backdrop-blur">
      <div className="truncate text-sm font-medium text-white">{focus?.name ?? "No folder"}</div>
      {focus ? (
        <dl className="mt-2 space-y-1">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Size</dt>
            <dd>{formatBytes(focus.sizeBytes)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Share</dt>
            <dd>{formatShare(focus.percentOfParent, diskUsed)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Children</dt>
            <dd>{focus.childCount.toLocaleString()}</dd>
          </div>
        </dl>
      ) : null}
      {scanStatus === "scanning" && progress ? (
        <p className="mt-2 truncate text-cyan-200" title={progress.currentPath}>
          Scanning {progress.scannedCount.toLocaleString()}
          {progress.accessDeniedCount > 0 ? ` · ${progress.accessDeniedCount} denied` : ""}
        </p>
      ) : null}
      {stale ? <p className="mt-2 text-amber-200">Folder changed on disk. Rescan to refresh totals.</p> : null}
    </aside>
  );
}
