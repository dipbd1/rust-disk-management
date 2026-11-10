import { useMemo } from "react";
import { formatBytes } from "../../lib/format";
import type { FileCategory } from "../../types/filesystem";
import { useFileStore } from "../../store/useFileStore";
import { useVisualizerStore } from "./visualizerState";

interface CategoryStat {
  key: FileCategory | "all";
  label: string;
  count: number;
  sizeBytes: number;
  color: string;
}

const CATEGORY_COLORS: Record<FileCategory, string> = {
  folder: "#00F0FF",
  media: "#FF007A",
  code: "#00FF87",
  heavy: "#FFC837",
  other: "#94A3B8",
};

export function CategoryFilterBar() {
  const view = useFileStore((state) => state.graphView);
  const activeFilter = useVisualizerStore((state) => state.categoryFilter);
  const setCategoryFilter = useVisualizerStore((state) => state.setCategoryFilter);

  const stats = useMemo(() => {
    if (!view) return [];
    const children = view.children;
    const items = view.other ? [...children, view.other] : children;

    const counts: Record<FileCategory, { count: number; bytes: number }> = {
      folder: { count: 0, bytes: 0 },
      media: { count: 0, bytes: 0 },
      code: { count: 0, bytes: 0 },
      heavy: { count: 0, bytes: 0 },
      other: { count: 0, bytes: 0 },
    };

    let totalBytes = 0;
    for (const item of items) {
      counts[item.category].count += 1;
      counts[item.category].bytes += item.sizeBytes;
      totalBytes += item.sizeBytes;
    }

    const result: CategoryStat[] = [
      { key: "all", label: "All Items", count: items.length, sizeBytes: totalBytes, color: "#38bdf8" },
      { key: "folder", label: "Folders", count: counts.folder.count, sizeBytes: counts.folder.bytes, color: CATEGORY_COLORS.folder },
      { key: "media", label: "Media", count: counts.media.count, sizeBytes: counts.media.bytes, color: CATEGORY_COLORS.media },
      { key: "code", label: "Code", count: counts.code.count, sizeBytes: counts.code.bytes, color: CATEGORY_COLORS.code },
      { key: "heavy", label: "> 5GB", count: counts.heavy.count, sizeBytes: counts.heavy.bytes, color: CATEGORY_COLORS.heavy },
      { key: "other", label: "Other", count: counts.other.count, sizeBytes: counts.other.bytes, color: CATEGORY_COLORS.other },
    ];

    return result.filter((item) => item.key === "all" || item.count > 0);
  }, [view]);

  if (!view || stats.length <= 1) return null;

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-10 flex max-w-[55%] flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-slate-900/80 p-1.5 shadow-xl backdrop-blur-md">
      {stats.map((item) => {
        const isActive = activeFilter === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setCategoryFilter(isActive && item.key !== "all" ? "all" : item.key)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              isActive
                ? "border border-white/20 bg-white/15 text-white shadow"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color, boxShadow: isActive ? `0 0 8px ${item.color}` : "none" }}
            />
            <span>{item.label}</span>
            <span className="rounded bg-black/30 px-1 py-0.5 text-[10px] font-mono text-slate-300">
              {item.count}
            </span>
            <span className="hidden font-mono text-[10px] text-slate-400 xl:inline">
              {formatBytes(item.sizeBytes)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
