import { useMemo, useRef } from "react";
import type { Object3D } from "three";
import { diskUsedRatio } from "../../lib/format";
import { isDriveRoot } from "../../lib/paths";
import { liquidColors } from "../../lib/colors";
import { useFileStore } from "../../store/useFileStore";
import { layoutGraph } from "./layoutGraph";
import { LiquidSphere } from "./LiquidSphere";
import { NodeLinkLine } from "./NodeLinkLine";
import { CosmicDust } from "./CosmicDust";
import { SpatialGrid } from "./SpatialGrid";

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
      {/* 3D Cosmic Environment & Floor Grid */}
      <CosmicDust />
      <SpatialGrid />

      {/* Spheres: Hub (the big circle) + Satellites */}
      {spheres.map((sphere, index) => {
        const isHub = sphere.node.id === hub.node.id;
        const isLarge = sphere.radius >= 1.25 || index <= 6;
        return (
          <LiquidSphere
            key={sphere.node.id}
            node={sphere.node}
            radius={sphere.radius}
            x={sphere.x}
            y={sphere.y}
            z={sphere.z}
            diskUsed={isHub && isDriveRoot(sphere.node.path) ? used : null}
            isHub={isHub}
            isLarge={isLarge}
            groups={groups}
          />
        );
      })}

      {/* Dynamic Synaptic Energy Filaments connecting Hub to Satellites */}
      {spheres.slice(1).map((sphere) => (
        <NodeLinkLine
          key={`link:${sphere.node.id}`}
          fromId={hub.node.id}
          toId={sphere.node.id}
          category={sphere.node.category}
          colorHex={liquidColors(sphere.node).a}
          groups={groups}
        />
      ))}
    </>
  );
}
