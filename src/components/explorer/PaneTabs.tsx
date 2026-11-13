import type { LeftTab } from "../../store/types";
import { useFileStore } from "../../store/useFileStore";

const TABS: { id: LeftTab; label: string }[] = [
  { id: "explorer", label: "Explorer" },
  { id: "largest", label: "Largest" },
  { id: "search", label: "Search" },
  { id: "types", label: "Types" },
  { id: "reclaim", label: "Reclaim" },
  { id: "duplicates", label: "Duplicates" },
  { id: "growth", label: "Growth" },
];

export function PaneTabs() {
  const leftTab = useFileStore((state) => state.leftTab);
  const setLeftTab = useFileStore((state) => state.setLeftTab);
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 px-2" role="tablist">
      {TABS.map((tab) => {
        const active = tab.id === leftTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`h-6 shrink-0 rounded-full px-2 text-[11px] ${active ? "bg-cyan-400/15 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}
            onClick={() => setLeftTab(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
