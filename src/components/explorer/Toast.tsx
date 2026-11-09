import { useEffect } from "react";
import { useFileStore } from "../../store/useFileStore";

export function Toast() {
  const toast = useFileStore((state) => state.toast);
  const dismissToast = useFileStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismissToast, 4200);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;
  return (
    <div role="status" className="fixed bottom-4 left-4 z-50 max-w-sm rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 shadow-xl">
      {toast}
    </div>
  );
}
