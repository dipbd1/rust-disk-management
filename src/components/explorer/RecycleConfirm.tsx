import { useFileStore } from "../../store/useFileStore";

export function RecycleConfirm() {
  const prompt = useFileStore((state) => state.recyclePrompt);
  const dismissRecycle = useFileStore((state) => state.dismissRecycle);
  const confirmRecycle = useFileStore((state) => state.confirmRecycle);
  if (!prompt) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="recycle-title" className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl">
        <h2 id="recycle-title" className="text-base font-medium text-white">
          {prompt.title}
        </h2>
        <p className="mt-2 text-sm text-slate-300">{prompt.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-md border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5" onClick={dismissRecycle}>
            Cancel
          </button>
          <button type="button" className="rounded-md bg-amber-500 px-3 py-1.5 text-sm text-slate-950 hover:bg-amber-400" onClick={() => void confirmRecycle()}>
            {prompt.kind === "bin" ? "Empty bin" : "Move to Recycle Bin"}
          </button>
        </div>
      </div>
    </div>
  );
}
