import { formatBytes } from "../../../lib/format";
import { STAYS_FREE_TOAST } from "../../../lib/reclaimView";
import type { RecycleBinStatus } from "../../../types/filesystem";
import { useFileStore } from "../../../store/useFileStore";

export function RecycleBinCard({ bin }: { bin: RecycleBinStatus }) {
  const promptRecycle = useFileStore((state) => state.promptRecycle);
  const size = bin.available ? formatBytes(bin.sizeBytes) : "Size unavailable";
  const count = bin.available ? `${bin.itemCount.toLocaleString()} items` : "Count unavailable";

  return (
    <section className="z-10 flex flex-col self-start rounded-xl border border-teal-400/25 bg-[#0B1020] p-3 @min-[960px]:sticky @min-[960px]:top-0">
      <h3 className="text-sm font-medium text-slate-100">Recycle Bin</h3>
      <p className="mt-2 text-lg font-semibold text-slate-50 tabular-nums">{size}</p>
      <p className="mt-1 text-xs text-slate-400">{count}</p>
      <p className="mt-2 text-xs text-slate-400">Already removed from their folders. Emptying the bin is permanent.</p>
      <button
        type="button"
        className="mt-3 h-9 rounded-lg bg-[#F43F5E] text-sm font-semibold text-[#0B0F17] hover:brightness-110"
        onClick={() =>
          promptRecycle({
            kind: "bin",
            title: "Empty the Recycle Bin?",
            body: bin.available
              ? `Windows will permanently remove ${formatBytes(bin.sizeBytes)} already in the bin. They do not return to the bin. On an SSD they are usually not recoverable.`
              : "Windows will permanently remove whatever is in the bin. The size could not be read. They do not return to the bin. On an SSD they are usually not recoverable.",
            outcome: STAYS_FREE_TOAST,
          })
        }
      >
        Empty bin
      </button>
    </section>
  );
}
