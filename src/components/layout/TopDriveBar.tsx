import { diskUsedRatio, formatDuration } from "../../lib/format";
import { breadcrumbs } from "../../lib/paths";
import { useFileStore } from "../../store/useFileStore";

export function TopDriveBar() {
  const drives = useFileStore((state) => state.drives);
  const activeDrive = useFileStore((state) => state.activeDrive);
  const scanDrive = useFileStore((state) => state.scanDrive);
  const focusedNodeId = useFileStore((state) => state.focusedNodeId);
  const focusNode = useFileStore((state) => state.focusNode);
  const scanStatus = useFileStore((state) => state.scanStatus);
  const progress = useFileStore((state) => state.progress);
  const stale = useFileStore((state) => state.stale);
  const cancelScan = useFileStore((state) => state.cancelScan);
  const rescan = useFileStore((state) => state.rescan);
  const elevated = useFileStore((state) => state.elevated);
  const elevationPrompt = useFileStore((state) => state.elevationPrompt);
  const restartElevated = useFileStore((state) => state.restartElevated);
  const scanFolder = useFileStore((state) => state.scanFolder);
  const ntfsFixed = drives.some((drive) => !drive.isRemovable && drive.fileSystem.toUpperCase() === "NTFS");

  const crumbs = focusedNodeId ? breadcrumbs(focusedNodeId) : [];

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-slate-900/70 px-3 backdrop-blur">
      <button type="button" className="h-8 shrink-0 rounded-md border border-white/10 px-2.5 text-xs hover:bg-white/5" onClick={() => void scanFolder()}>
        Folder
      </button>
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto">
        {drives.map((drive) => {
          const used = diskUsedRatio(drive) * 100;
          const active = drive.mount === activeDrive;
          return (
            <button
              key={drive.mount}
              type="button"
              title={`${drive.label || drive.mount} · ${drive.fileSystem}`}
              className={`flex h-8 items-center gap-2 rounded-full border px-2.5 text-xs ${active ? "border-cyan-300/70 bg-cyan-400/10" : "border-white/10 hover:bg-white/5"}`}
              onClick={() => void scanDrive(drive.mount)}
            >
              <span className="font-medium">{drive.mount.replace(/\\$/, "")}</span>
              <span className="h-1 w-12 overflow-hidden rounded bg-white/10">
                <span className="block h-full bg-cyan-300" style={{ width: `${used}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm" aria-label="Path">
        {crumbs.map((crumb, index) => (
          <span key={crumb.path} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <span className="text-slate-600">/</span> : null}
            <button type="button" className="truncate text-slate-200 hover:text-white" onClick={() => void focusNode(crumb.path)}>
              {crumb.label || crumb.path}
            </button>
          </span>
        ))}
      </nav>
      {scanStatus === "scanning" && progress ? (
        <span className="hidden max-w-48 truncate text-xs text-cyan-100 xl:inline" title={progress.currentPath}>
          {progress.scannedCount.toLocaleString()} · {formatDuration(progress.elapsedMs)}
        </span>
      ) : null}
      {scanStatus === "scanning" ? (
        <button type="button" className="h-8 shrink-0 rounded-md border border-white/10 px-2.5 text-xs hover:bg-white/5" onClick={() => void cancelScan()}>
          Cancel
        </button>
      ) : null}
      {stale && scanStatus !== "scanning" ? (
        <button type="button" className="h-8 shrink-0 rounded-md border border-amber-300/40 px-2.5 text-xs text-amber-100 hover:bg-amber-400/10" onClick={() => void rescan()}>
          Rescan
        </button>
      ) : null}
      {!elevated && !elevationPrompt && ntfsFixed ? (
        <button type="button" className="h-8 shrink-0 rounded-md border border-cyan-300/40 px-2.5 text-xs text-cyan-100 hover:bg-cyan-400/10" onClick={() => void restartElevated()}>
          Faster scan
        </button>
      ) : null}
    </header>
  );
}
