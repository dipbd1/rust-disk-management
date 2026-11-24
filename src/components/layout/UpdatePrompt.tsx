import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../lib/format";
import { checkForAppUpdate, type AppUpdateInfo } from "../../services/tauriBridge";
import { useFileStore } from "../../store/useFileStore";

/** Non-blocking startup check. Shows a dismissible bar when GitHub has a newer release. */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const dismissed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await checkForAppUpdate();
        if (!cancelled && next && !dismissed.current) setUpdate(next);
      } catch {
        // Startup check is best-effort: offline, missing pubkey, or draft-only releases stay quiet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-40 flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-lg border border-cyan-300/30 bg-slate-900/95 px-3 py-2 text-sm text-slate-100 shadow-lg"
    >
      <span className="min-w-0">
        Update available <span className="font-medium text-cyan-200">v{update.version}</span>
      </span>
      <button
        type="button"
        disabled={busy}
        className="shrink-0 rounded-md bg-cyan-300 px-2.5 py-1 text-xs font-medium text-slate-950 hover:bg-cyan-200 disabled:opacity-60"
        onClick={() => {
          setBusy(true);
          void update.installAndRelaunch().catch((error) => {
            setBusy(false);
            useFileStore.setState({ toast: errorMessage(error) });
          });
        }}
      >
        {busy ? "Installing…" : "Install and restart"}
      </button>
      <button
        type="button"
        aria-label="Dismiss update"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white"
        onClick={() => {
          dismissed.current = true;
          setUpdate(null);
        }}
      >
        ×
      </button>
    </div>
  );
}
