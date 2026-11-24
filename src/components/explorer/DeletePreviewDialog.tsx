import type { ReactNode } from "react";
import { formatBytes } from "../../lib/format";
import { summaryLine } from "../../lib/deletePreview";
import type { DeletePreviewItem } from "../../types/filesystem";

export type PreviewDestination = "recycleBin" | "permanent" | "emptyBin";

export function DeletePreviewDialog({
  title,
  destination,
  items,
  totalCount,
  totalBytes,
  note,
  confirmLabel,
  confirmClassName,
  confirmDisabled,
  onCancel,
  onConfirm,
  footer,
}: {
  title: string;
  destination: PreviewDestination;
  items: DeletePreviewItem[];
  totalCount: number;
  totalBytes: number;
  note?: string;
  confirmLabel: string;
  confirmClassName: string;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-preview-title"
        className="flex w-full max-w-lg flex-col rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl"
      >
        <h2 id="delete-preview-title" className="text-base font-medium text-white">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-300">{destinationLine(destination)}</p>
        <p className="mt-1 text-sm font-medium text-slate-100">{summaryLine(totalCount, totalBytes)}</p>
        {note ? <p className="mt-2 text-sm text-slate-400">{note}</p> : null}
        {items.length > 0 ? (
          <ul className="mt-3 max-h-56 overflow-auto rounded-md border border-white/10 bg-black/20">
            {items.map((item) => (
              <li key={item.path} className="border-b border-white/5 px-3 py-2 last:border-b-0">
                <p className="truncate text-sm text-slate-100" title={item.name}>
                  {item.name}
                </p>
                <p className="truncate text-[11px] text-slate-500" title={item.path}>
                  {item.path}
                </p>
                <p className="font-mono text-[11px] text-slate-400">{formatBytes(item.sizeBytes)}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {footer}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-md border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            className={`rounded-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${confirmClassName}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function destinationLine(destination: PreviewDestination): string {
  switch (destination) {
    case "recycleBin":
      return "Destination: Recycle Bin (you can restore later).";
    case "permanent":
      return "Destination: permanent delete — removed from disk and cannot be undone.";
    case "emptyBin":
      return "Destination: empty the Recycle Bin permanently.";
    default: {
      const _exhaustive: never = destination;
      return _exhaustive;
    }
  }
}
