import { useEffect } from "react";
import { useFileStore } from "../../store/useFileStore";

type ToastTone = "wait" | "error" | "success";

const ERROR_TEXT = /failed|error|denied|cannot|can't/i;

function toastTone(message: string): ToastTone {
  if (message.includes("Please wait") || message.startsWith("Scanning")) return "wait";
  if (message === "Something went wrong" || ERROR_TEXT.test(message)) return "error";
  return "success";
}

const TONE_CLASS: Record<ToastTone, string> = {
  success: "bg-cyan-300 text-slate-950",
  wait: "border border-white/10 bg-slate-800 text-slate-100",
  error: "bg-rose-600 text-white",
};

export function Toast() {
  const toast = useFileStore((state) => state.toast);
  const dismissToast = useFileStore((state) => state.dismissToast);
  const tone = toast ? toastTone(toast) : null;

  useEffect(() => {
    if (!toast || tone === "error") return;
    const timer = window.setTimeout(dismissToast, 4200);
    return () => window.clearTimeout(timer);
  }, [toast, tone, dismissToast]);

  if (!toast || !tone) return null;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`fixed top-16 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-center text-sm font-semibold whitespace-normal shadow-lg ${TONE_CLASS[tone]}`}
    >
      <span className="min-w-0 text-center whitespace-normal break-words">{toast}</span>
      <button type="button" aria-label="Dismiss" onClick={dismissToast} className="grid h-5 w-5 shrink-0 place-items-center rounded-full leading-none hover:bg-black/10">
        ×
      </button>
    </div>
  );
}
