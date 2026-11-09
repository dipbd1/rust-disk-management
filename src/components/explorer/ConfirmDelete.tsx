import { useFileStore } from "../../store/useFileStore";

export function ConfirmDelete() {
  const confirmPath = useFileStore((state) => state.confirmPath);
  const nodes = useFileStore((state) => state.nodes);
  const dismissConfirm = useFileStore((state) => state.dismissConfirm);
  const confirmPermanentDelete = useFileStore((state) => state.confirmPermanentDelete);
  if (!confirmPath) return null;
  const node = nodes[confirmPath];
  const label = node?.name || confirmPath;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") dismissConfirm();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl">
        <h2 id="delete-title" className="text-base font-medium text-white">
          Permanently delete?
        </h2>
        <p className="mt-2 truncate text-sm text-slate-200" title={confirmPath}>
          {label}
        </p>
        <p className="mt-1 text-sm text-slate-400">This removes the item from disk and cannot be undone.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-md border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5" onClick={dismissConfirm}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-rose-500 px-3 py-1.5 text-sm text-white hover:bg-rose-400"
            onClick={() => void confirmPermanentDelete()}
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
