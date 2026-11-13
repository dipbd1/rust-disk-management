import { useEffect } from "react";
import { ConfirmDelete } from "./components/explorer/ConfirmDelete";
import { RecycleConfirm } from "./components/explorer/RecycleConfirm";
import { Toast } from "./components/explorer/Toast";
import { ElevationPrompt } from "./components/layout/ElevationPrompt";
import { SplitWorkspace } from "./components/layout/SplitWorkspace";
import { TopDriveBar } from "./components/layout/TopDriveBar";
import { useFileStore } from "./store/useFileStore";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export default function App() {
  const boot = useFileStore((state) => state.boot);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || isTypingTarget(event.target)) return;
      const state = useFileStore.getState();
      if (!state.selectedNodeId || state.confirmPath || state.recyclePrompt) return;
      event.preventDefault();
      if (event.shiftKey) state.requestPermanentDelete(state.selectedNodeId);
      else state.requestTrash(state.selectedNodeId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0B0F17] text-slate-100">
      <TopDriveBar />
      <SplitWorkspace />
      <ElevationPrompt />
      <ConfirmDelete />
      <RecycleConfirm />
      <Toast />
    </div>
  );
}
