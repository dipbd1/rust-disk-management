import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatBytes } from "../../lib/format";
import { getNodeVisualTheme } from "../../lib/nodeColors";
import { useFileStore } from "../../store/useFileStore";
import { squarify } from "./layoutArea";

export function AreaMap() {
  const graphView = useFileStore((state) => state.graphView);
  const focusNode = useFileStore((state) => state.focusNode);
  const selectNode = useFileStore((state) => state.selectNode);
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w > 0 && h > 0) setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const nodes = useMemo(() => {
    if (!graphView) return [];
    return graphView.other ? [...graphView.children, graphView.other] : graphView.children;
  }, [graphView]);
  const rects = useMemo(
    () => squarify(nodes.map((node) => ({ id: node.id, size: node.sizeBytes })), size.w, size.h),
    [nodes, size],
  );
  return (
    <div ref={frame} className="absolute inset-0">
      {rects.map((rect, index) => {
        const node = nodes.find((item) => item.id === rect.id);
        if (!node) return null;
        const theme = getNodeVisualTheme(node, index);
        return (
          <button
            key={node.id}
            type="button"
            title={`${node.name} · ${formatBytes(node.sizeBytes)}`}
            className="absolute overflow-hidden border border-black/40 px-1 text-left"
            style={{ left: rect.x, top: rect.y, width: Math.max(0, rect.w - 1), height: Math.max(0, rect.h - 1), background: theme.secondary, color: theme.crest }}
            onClick={() => {
              if (node.kind === "folder") void focusNode(node.path);
              else if (node.kind === "file") selectNode(node.id);
            }}
          >
            {rect.w > 72 && rect.h > 28 ? <span className="block truncate text-[11px]">{node.name}</span> : null}
            {rect.w > 72 && rect.h > 44 ? <span className="block truncate font-mono text-[10px] opacity-80">{formatBytes(node.sizeBytes)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
