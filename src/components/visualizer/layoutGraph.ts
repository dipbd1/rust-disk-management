import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type ForceLink3D,
  type ForceNode3D,
} from "d3-force-3d";
import { GRAPH_CHILD_CAP } from "../../lib/limits";
import { sphereRadius } from "../../lib/scale";
import type { FileNode, GraphView } from "../../types/filesystem";

export interface GraphPoint {
  node: FileNode;
  radius: number;
  x: number;
  y: number;
  z: number;
}

const LAYOUT_LIMIT = 12;

function endpointRadius(end: string | ForceNode3D): number {
  return typeof end === "string" ? 1 : end.radius;
}

export function layoutGraph(view: GraphView): GraphPoint[] {
  const children = view.children.slice(0, GRAPH_CHILD_CAP);
  const bodies = view.other ? [...children, view.other] : children;
  const sized = [view.focus, ...bodies];
  const maxBytes = sized.reduce((max, node) => Math.max(max, node.sizeBytes), 1);
  const simNodes: ForceNode3D[] = sized.map((node) => ({
    id: node.id,
    radius: sphereRadius(node.sizeBytes, maxBytes),
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
  }));
  const hub = simNodes[0];
  hub.fx = 0;
  hub.fy = 0;
  hub.fz = 0;

  const satellites = simNodes.slice(1);
  satellites.forEach((node, index) => {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const span = Math.max(satellites.length - 1, 1);
    const y = satellites.length === 1 ? 0 : 1 - (index / span) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * index;
    const dist = 4.2 + node.radius;
    node.x = Math.cos(theta) * ring * dist;
    node.y = y * dist * 0.7;
    node.z = Math.sin(theta) * ring * dist;
  });

  const links: ForceLink3D[] = satellites.map((node) => ({ source: hub.id, target: node.id }));
  const simulation = forceSimulation(simNodes, 3).stop();
  simulation.force("charge", forceManyBody().strength(-18).distanceMax(28));
  simulation.force(
    "link",
    forceLink(links)
      .id((node) => node.id)
      .distance((link) => endpointRadius(link.source) + endpointRadius(link.target) + 1.6),
  );
  simulation.force(
    "collide",
    forceCollide((node) => node.radius + 0.28).iterations(2),
  );
  simulation.force("center", forceCenter(0, 0, 0));
  for (let step = 0; step < 280; step += 1) simulation.tick();
  simulation.stop();

  return simNodes.map((node, index) => {
    let x = node.x ?? 0;
    let y = node.y ?? 0;
    let z = node.z ?? 0;
    if (index > 0) {
      const length = Math.hypot(x, y, z);
      if (length > LAYOUT_LIMIT) {
        const scale = LAYOUT_LIMIT / length;
        x *= scale;
        y *= scale;
        z *= scale;
      }
    } else {
      x = 0;
      y = 0;
      z = 0;
    }
    return { node: sized[index], radius: node.radius, x, y, z };
  });
}
