import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";
import { isDriveRoot } from "../../lib/paths";
import type { FileNode } from "../../types/filesystem";
import { useFileStore } from "../../store/useFileStore";

const itemClass = "cursor-pointer rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-white/10";

export function NodeContextMenu({ node, children }: { node: FileNode; children: ReactNode }) {
  const focusNode = useFileStore((state) => state.focusNode);
  const selectNode = useFileStore((state) => state.selectNode);
  const reveal = useFileStore((state) => state.reveal);
  const requestTrash = useFileStore((state) => state.requestTrash);
  const requestPermanentDelete = useFileStore((state) => state.requestPermanentDelete);
  const copyNodePath = useFileStore((state) => state.copyNodePath);
  const destructive = node.kind !== "aggregate" && !isDriveRoot(node.path);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuPortal>
        <ContextMenuContent className="z-50 min-w-52 rounded-lg border border-white/10 bg-slate-900/95 p-1 text-slate-100 shadow-2xl backdrop-blur">
          <ContextMenuItem
            className={itemClass}
            onSelect={() => {
              if (node.kind === "folder" || node.kind === "file") void focusNode(node.id);
              else selectNode(node.id);
            }}
          >
            Focus in 3D
          </ContextMenuItem>
          <ContextMenuItem className={itemClass} onSelect={() => void reveal(node.path)}>
            Reveal in Explorer
          </ContextMenuItem>
          <ContextMenuItem className={itemClass} onSelect={() => void copyNodePath(node.path)}>
            Copy Path
          </ContextMenuItem>
          {destructive ? (
            <>
              <ContextMenuSeparator className="my-1 h-px bg-white/10" />
              <ContextMenuItem className={`${itemClass} text-amber-200`} onSelect={() => requestTrash(node.path)}>
                Move to Recycle Bin
              </ContextMenuItem>
              <ContextMenuItem
                className={`${itemClass} text-rose-300`}
                onSelect={() => requestPermanentDelete(node.path)}
              >
                Permanent Delete
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenuPortal>
    </ContextMenu>
  );
}
