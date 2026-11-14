import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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

const SCROLL_STEP = 132;

function edgeMask(left: boolean, right: boolean): CSSProperties | undefined {
  if (!left && !right) return undefined;
  const leftStop = left ? "transparent, #000 28px" : "#000 0";
  const rightStop = right ? "#000 calc(100% - 28px), transparent" : "#000 100%";
  const image = `linear-gradient(to right, ${leftStop}, ${rightStop})`;
  return { maskImage: image, WebkitMaskImage: image };
}

export function PaneTabs() {
  const leftTab = useFileStore((state) => state.leftTab);
  const setLeftTab = useFileStore((state) => state.setLeftTab);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const revealActive = () => {
      const active = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      active?.scrollIntoView({ inline: "nearest", block: "nearest" });
    };
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setCanLeft(el.scrollLeft > 1);
      setCanRight(max > 1 && el.scrollLeft < max - 1);
    };
    const onResize = () => {
      revealActive();
      measure();
    };

    onResize();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(onResize);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [leftTab]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      event.preventDefault();
      el.scrollLeft += delta;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const scrollByStep = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: direction * SCROLL_STEP, behavior: "smooth" });
  };

  return (
    <div className="relative flex h-8 min-w-0 shrink-0 overflow-hidden border-b border-white/10" role="tablist">
      {canLeft ? <ScrollChevron direction="left" onClick={() => scrollByStep(-1)} /> : null}
      <div
        ref={scrollerRef}
        className="pane-tabs-scroll flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden px-2"
        style={edgeMask(canLeft, canRight)}
      >
        {TABS.map((tab) => {
          const active = tab.id === leftTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`h-6 shrink-0 scroll-mx-7 rounded-full px-2 text-[11px] ${active ? "bg-cyan-400/15 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}
              onClick={() => setLeftTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {canRight ? <ScrollChevron direction="right" onClick={() => scrollByStep(1)} /> : null}
    </div>
  );
}

function ScrollChevron({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }) {
  const left = direction === "left";
  return (
    <button
      type="button"
      aria-label={left ? "Show earlier sections" : "Show later sections"}
      className={`absolute top-0 z-10 flex h-8 w-5 items-center justify-center text-slate-400 hover:text-slate-100 ${left ? "left-0 bg-gradient-to-r from-[#0B0F17] from-40% to-transparent" : "right-0 bg-gradient-to-l from-[#0B0F17] from-40% to-transparent"}`}
      onClick={onClick}
    >
      <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={left ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
      </svg>
    </button>
  );
}
