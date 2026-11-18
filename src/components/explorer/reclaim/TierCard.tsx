import { useCallback, useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes } from "../../../lib/format";
import type { ReclaimRow, ReclaimTier } from "../../../types/filesystem";
import { reclaimPalette } from "./palette";
import { ReclaimRowView } from "./ReclaimRowView";

const ROW_ESTIMATE = 96;
const TIER_INK: Record<ReclaimTier, string> = {
  safe: reclaimPalette.safe,
  rebuild: reclaimPalette.rebuild,
  review: reclaimPalette.review,
  system: "#94a3b8",
};

interface TierAction {
  label: string;
  disabled: boolean;
  className: string;
  onClick: () => void;
}

interface TierCardProps {
  title: string;
  bytes: number;
  rimClass: string;
  rows: ReclaimRow[];
  tier: ReclaimTier;
  empty: string | null;
  action?: TierAction;
  checked: Set<string>;
  showCheck: boolean;
  accentClass: string;
  showRecycle: boolean;
  selectedId: string | null;
  open: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onToggle: (id: string) => void;
  onSelect: (row: ReclaimRow) => void;
  onToggleOpen: () => void;
  onRecycle?: (row: ReclaimRow) => void;
  sectionRef?: Ref<HTMLElement>;
}

export function TierCard({
  title,
  bytes,
  rimClass,
  rows,
  tier,
  empty,
  action,
  checked,
  showCheck,
  accentClass,
  showRecycle,
  selectedId,
  open,
  scrollRef,
  onToggle,
  onSelect,
  onToggleOpen,
  onRecycle,
  sectionRef,
}: TierCardProps) {
  const panelId = `reclaim-tier-${tier}`;
  const headerClass = open ? "sticky top-0 z-10 rounded-t-xl border-b border-white/10 bg-[#0B1020]" : "";
  const countLabel = `${rows.length.toLocaleString()} ${rows.length === 1 ? "item" : "items"}`;

  return (
    <section ref={sectionRef} className={`scroll-mt-2 rounded-xl border bg-[#0B1020] ${rimClass}`}>
      <div className={`flex items-center gap-2 px-3 py-2.5 ${headerClass}`}>
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2 rounded-md text-left hover:bg-white/[0.04] focus-visible:bg-white/[0.04]"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={onToggleOpen}
          >
            <Chevron open={open} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{title}</span>
            <span className="flex shrink-0 items-baseline gap-2.5 pl-3">
              <span className="text-xs text-slate-500 tabular-nums">{countLabel}</span>
              {tier !== "safe" && bytes > 0 ? (
                <span className="text-sm font-medium tabular-nums" style={{ color: TIER_INK[tier] }}>
                  {formatBytes(bytes)}
                </span>
              ) : null}
            </span>
          </button>
        </h3>
        {action ? (
          <button type="button" disabled={action.disabled} className={action.className} onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
      {open && rows.length === 0 && empty ? (
        <p id={panelId} className="px-3 py-3 text-xs text-slate-500">
          {empty}
        </p>
      ) : null}
      {open && rows.length > 0 ? (
        <TierList
          panelId={panelId}
          rows={rows}
          tier={tier}
          scrollRef={scrollRef}
          checked={checked}
          showCheck={showCheck}
          accentClass={accentClass}
          showRecycle={showRecycle}
          selectedId={selectedId}
          onToggle={onToggle}
          onSelect={onSelect}
          onRecycle={onRecycle}
        />
      ) : null}
    </section>
  );
}

function TierList(props: {
  panelId: string;
  rows: ReclaimRow[];
  tier: ReclaimTier;
  scrollRef: RefObject<HTMLDivElement | null>;
  checked: Set<string>;
  showCheck: boolean;
  accentClass: string;
  showRecycle: boolean;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (row: ReclaimRow) => void;
  onRecycle?: (row: ReclaimRow) => void;
}) {
  const anchor = useListAnchor(props.scrollRef);
  if (anchor.margin === null) {
    return <div id={props.panelId} ref={anchor.ref} className="px-2 pt-2" />;
  }
  return <MeasuredList {...props} listRef={anchor.ref} margin={anchor.margin} />;
}

function MeasuredList({
  panelId,
  rows,
  tier,
  scrollRef,
  listRef,
  margin,
  checked,
  showCheck,
  accentClass,
  showRecycle,
  selectedId,
  onToggle,
  onSelect,
  onRecycle,
}: {
  panelId: string;
  rows: ReclaimRow[];
  tier: ReclaimTier;
  scrollRef: RefObject<HTMLDivElement | null>;
  listRef: (node: HTMLDivElement | null) => void;
  margin: number;
  checked: Set<string>;
  showCheck: boolean;
  accentClass: string;
  showRecycle: boolean;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (row: ReclaimRow) => void;
  onRecycle?: (row: ReclaimRow) => void;
}) {
  const scroll = scrollRef.current;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    measureElement: (element) => element.getBoundingClientRect().height,
    scrollMargin: margin,
    initialRect: { width: scroll?.clientWidth ?? 0, height: scroll?.clientHeight ?? 0 },
    initialOffset: scroll?.scrollTop ?? 0,
    overscan: 6,
  });
  const shift = virtualizer.options.scrollMargin ?? margin;

  return (
    <div id={panelId} className="px-2 pt-2">
      <div ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (!row) return null;
          return (
            <div
              key={row.id}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-2"
              style={{ transform: `translateY(${item.start - shift}px)` }}
            >
              <ReclaimRowView
                row={row}
                tier={tier}
                selected={selectedId === row.id}
                checked={checked.has(row.id)}
                showCheck={showCheck}
                accentClass={accentClass}
                showRecycle={showRecycle}
                onToggle={onToggle}
                onSelect={onSelect}
                onRecycle={onRecycle}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useListAnchor(scrollRef: RefObject<HTMLDivElement | null>) {
  const listNode = useRef<HTMLDivElement | null>(null);
  const [margin, setMargin] = useState<number | null>(null);

  const measure = useCallback(() => {
    const list = listNode.current;
    const scroll = scrollRef.current;
    if (!list || !scroll) return;
    const next = Math.round(list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop);
    setMargin((current) => (current === next ? current : next));
  }, [scrollRef]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    for (const child of scroll.children) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, scrollRef]);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      listNode.current = node;
      if (node) measure();
    },
    [measure],
  );

  return { margin, ref };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-400 motion-safe:transition-transform motion-safe:duration-150 ${open ? "rotate-90" : ""}`}>
      <path d="M6 3.5 11 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
