import { DeletePreviewDialog } from "./DeletePreviewDialog";
import { useFileStore } from "../../store/useFileStore";

export function RecycleConfirm() {
  const prompt = useFileStore((state) => state.recyclePrompt);
  const dismissRecycle = useFileStore((state) => state.dismissRecycle);
  const confirmRecycle = useFileStore((state) => state.confirmRecycle);
  if (!prompt) return null;
  const destination = prompt.kind === "bin" ? "emptyBin" : "recycleBin";
  const confirmLabel = prompt.kind === "bin" ? "Empty bin" : "Move to Recycle Bin";
  return (
    <DeletePreviewDialog
      title={prompt.title}
      destination={destination}
      items={prompt.items}
      totalCount={prompt.totalCount}
      totalBytes={prompt.totalBytes}
      note={prompt.note}
      confirmLabel={confirmLabel}
      confirmClassName={
        prompt.kind === "bin"
          ? "bg-rose-500 text-white hover:bg-rose-400"
          : "bg-amber-500 text-slate-950 hover:bg-amber-400"
      }
      onCancel={dismissRecycle}
      onConfirm={() => void confirmRecycle()}
    />
  );
}
