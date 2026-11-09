import { useMemo, useRef } from "react";
import type { Object3D } from "three";
import { diskUsedRatio } from "../../lib/format";
import { isDriveRoot } from "../../lib/paths";
import { useFileStore } from "../../store/useFileStore";
import { layoutGraph } from "./layoutGraph";
import { LiquidSphere } from "./LiquidSphere";
import { NodeLinkLine } from "./NodeLinkLine";

export function ForceGraph3D() {
  const view = useFileStore((state) => state.graphView);
  const drives = useFileStore((state) => state.drives);
  const activeDrive = useFileStore((state) => state.activeDrive);
  const groups = useRef(new Map<string, Object3D>());
  const spheres = useMemo(() => (view ? layoutGraph(view) : []), [view]);
  const hub = spheres[0];
  if (!view || !hub) return null;
  const drive = drives.find((item) => item.mount === activeDrive);
  const used = diskUsedRatio(drive);

  return (
    <>
      {spheres.map((sphere) => (
        <LiquidSphere
          key={sphere.node.id}
          node={sphere.node}
          radius={sphere.radius}
          x={sphere.x}
          y={sphere.y}
          z={sphere.z}
          diskUsed={sphere.node.id === view.focus.id && isDriveRoot(sphere.node.path) ? used : null}
          groups={groups}
        />
      ))}
      {spheres.slice(1).map((sphere) => (
        <NodeLinkLine key={`link:${sphere.node.id}`} fromId={hub.node.id} toId={sphere.node.id} groups={groups} />
      ))}
    </>
  );
}
