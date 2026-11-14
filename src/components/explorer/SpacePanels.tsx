import { useEffect, useState } from "react";
import { formatBytes } from "../../lib/format";
import { useFileStore } from "../../store/useFileStore";
import { NodePage } from "./NodePage";

function ready(status: string): boolean {
  return status === "ready" || status === "cancelled";
}

export function SearchPanel() {
  const scanStatus = useFileStore((state) => state.scanStatus);
  const page = useFileStore((state) => state.searchPage);
  const searchWhole = useFileStore((state) => state.searchWhole);
  const loadMoreSearch = useFileStore((state) => state.loadMoreSearch);
  const openLocated = useFileStore((state) => state.openLocated);
  const [text, setText] = useState("");
  useEffect(() => {
    if (!ready(scanStatus)) return;
    const timer = window.setTimeout(() => void searchWhole(text), 200);
    return () => window.clearTimeout(timer);
  }, [text, scanStatus, searchWhole]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="px-3 py-2">
        <span className="sr-only">Search the scan</span>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search every file and folder"
          className="h-8 w-full rounded-md border border-white/10 bg-black/20 px-2 text-sm outline-none focus:border-cyan-300/50"
        />
      </label>
      {!ready(scanStatus) ? (
        <p className="px-3 py-2 text-sm text-slate-500">Finish a scan to search it.</p>
      ) : (
        <NodePage
          nodes={page?.nodes ?? []}
          total={page?.total ?? 0}
          empty={text.trim() ? "No matches." : "Type a name to search the whole scan."}
          onOpen={(node) => void openLocated(node)}
          onLoadMore={() => void loadMoreSearch(text)}
        />
      )}
    </div>
  );
}

export function TypesPanel() {
  const scanStatus = useFileStore((state) => state.scanStatus);
  const extensions = useFileStore((state) => state.extensions);
  const target = useFileStore((state) => state.extensionTarget);
  const page = useFileStore((state) => state.extensionPage);
  const loadExtensions = useFileStore((state) => state.loadExtensions);
  const openExtension = useFileStore((state) => state.openExtension);
  const loadMoreExtension = useFileStore((state) => state.loadMoreExtension);
  const openLocated = useFileStore((state) => state.openLocated);
  useEffect(() => {
    if (ready(scanStatus) && !extensions) void loadExtensions();
  }, [scanStatus, extensions, loadExtensions]);
  if (!ready(scanStatus)) return <p className="px-3 py-4 text-sm text-slate-500">Finish a scan to see file types.</p>;
  if (target && page) {
    const label = target.other ? "Other" : `.${target.extension}`;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <button type="button" className="h-8 px-3 text-left text-xs text-cyan-200" onClick={() => void loadExtensions()}>
          Back to types
        </button>
        <p className="px-3 pb-1 text-xs text-slate-400">{label}</p>
        <NodePage nodes={page.nodes} total={page.total} empty="No files." onOpen={(node) => void openLocated(node)} onLoadMore={() => void loadMoreExtension()} />
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {(extensions?.rows ?? []).map((row) => (
        <button
          key={row.other ? "other" : row.extension}
          type="button"
          className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-white/5"
          onClick={() => void openExtension({ extension: row.extension, other: row.other })}
        >
          <span className="min-w-0 flex-1 truncate">{row.other ? "Other" : `.${row.extension}`}</span>
          <span className="font-mono text-[11px] text-slate-500">{row.count.toLocaleString()}</span>
          <span className="font-mono text-[11px] text-slate-300">{formatBytes(row.sizeBytes)}</span>
        </button>
      ))}
    </div>
  );
}
