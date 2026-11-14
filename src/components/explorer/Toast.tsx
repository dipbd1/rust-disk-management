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
    <div role="status" className="fixed top-14 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg">
      {toast}
    </div>
  );
}
