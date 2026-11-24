import { useState } from "react";
import { DeletePreviewDialog } from "./DeletePreviewDialog";
import { useFileStore } from "../../store/useFileStore";
import type { PermanentPrompt } from "../../store/types";

export function ConfirmDelete() {
  const prompt = useFileStore((state) => state.permanentPrompt);
  if (!prompt) return null;
  return <ConfirmDeleteBody key={prompt.path} prompt={prompt} />;
}

function ConfirmDeleteBody({ prompt }: { prompt: PermanentPrompt }) {
  const dismissConfirm = useFileStore((state) => state.dismissConfirm);
  const confirmPermanentDelete = useFileStore((state) => state.confirmPermanentDelete);
  const [understood, setUnderstood] = useState(false);

  return (
    <DeletePreviewDialog
      title={prompt.title}
      destination="permanent"
      items={prompt.items}
      totalCount={prompt.totalCount}
      totalBytes={prompt.totalBytes}
      note={prompt.note}
      confirmLabel="Delete permanently"
      confirmClassName="bg-rose-500 text-white hover:bg-rose-400"
      confirmDisabled={!understood}
      onCancel={dismissConfirm}
      onConfirm={() => void confirmPermanentDelete()}
      footer={
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="mt-1"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
          />
          <span>I understand this permanently deletes these items and cannot be undone.</span>
        </label>
      }
    />
  );
}
