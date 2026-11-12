import { useState } from "react";
import { useFileStore } from "../../store/useFileStore";

export function ElevationPrompt() {
  const open = useFileStore((state) => state.elevationPrompt);
  const continueWithoutElevation = useFileStore((state) => state.continueWithoutElevation);
  const restartElevated = useFileStore((state) => state.restartElevated);
  const [remember, setRemember] = useState(false);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="elevation-title"
        tabIndex={-1}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Escape") void continueWithoutElevation(false);
        }}
        className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl outline-none"
      >
        <h2 id="elevation-title" className="text-base font-medium text-white">
          Faster scan needs administrator
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          An administrator scan reads the drive file table and usually finishes in seconds. Without it, this app still scans by walking folders, which takes longer.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          Don't ask again
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
            onClick={() => void continueWithoutElevation(remember)}
          >
            Continue without
          </button>
          <button
            type="button"
            className="rounded-md bg-cyan-300 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-200"
            onClick={() => void restartElevated()}
          >
            Restart as administrator
          </button>
        </div>
      </div>
    </div>
  );
}
