import { breadcrumbs } from "../../lib/paths";
import { useFileStore } from "../../store/useFileStore";

export function ViewerBreadcrumbs() {
  const focusedNodeId = useFileStore((state) => state.focusedNodeId);
  const focusNode = useFileStore((state) => state.focusNode);
  const graphView = useFileStore((state) => state.graphView);

  const activePath = focusedNodeId ?? graphView?.focus.path ?? "";
  const crumbs = activePath ? breadcrumbs(activePath) : [];

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="3D Navigation Path"
      className="pointer-events-auto absolute top-3 left-3 z-10 flex max-w-[70%] items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 shadow-lg backdrop-blur-md"
    >
      <span className="mr-1 text-[11px] font-semibold tracking-wider text-cyan-400 uppercase">HUB</span>
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <div key={crumb.path} className="flex items-center gap-1 whitespace-nowrap">
            {idx > 0 && <span className="text-slate-600">/</span>}
            <button
              type="button"
              onClick={() => void focusNode(crumb.path)}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                isLast
                  ? "font-semibold text-white bg-white/10"
                  : "text-slate-400 hover:bg-white/10 hover:text-slate-100"
              }`}
              title={crumb.path}
            >
              {crumb.label || crumb.path}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
