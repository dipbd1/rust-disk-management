import type { Crumb } from "../../lib/paths";

interface CanvasBreadcrumbsProps {
  crumbs: readonly Crumb[];
  disabled: boolean;
  onSelect: (path: string) => void;
}

export function CanvasBreadcrumbs({ crumbs, disabled, onSelect }: CanvasBreadcrumbsProps) {
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Canvas path navigation"
      className="pointer-events-auto absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-24px)] items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-[#0B1020]/85 px-2.5 py-1 text-xs text-slate-300 shadow-xl backdrop-blur-md"
    >
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        const isParent = idx === crumbs.length - 2;
        return (
          <div key={crumb.path} className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            {idx > 0 && <span className="text-slate-600">/</span>}
            <button
              type="button"
              disabled={isLast || disabled}
              onClick={() => {
                if (isLast || disabled) return;
                onSelect(crumb.path);
              }}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                isLast
                  ? "bg-cyan-500/20 font-semibold text-cyan-100"
                  : isParent
                    ? "text-cyan-300/90 hover:bg-cyan-500/15 hover:text-white"
                    : "text-slate-400 hover:bg-white/10 hover:text-slate-100"
              } ${disabled && !isLast ? "cursor-not-allowed opacity-60" : ""}`}
              title={isLast ? crumb.path : `Navigate to ${crumb.path}`}
            >
              {crumb.label || crumb.path}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
