declare module "d3-force-3d" {
  export interface ForceNode3D {
    id: string;
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
    radius: number;
  }

  export interface ForceLink3D {
    source: string | ForceNode3D;
    target: string | ForceNode3D;
    index?: number;
  }

  export interface ManyBodyForce {
    strength(value: number): ManyBodyForce;
    distanceMax(value: number): ManyBodyForce;
    distanceMin(value: number): ManyBodyForce;
  }

  export interface LinkForce {
    id(accessor: (node: ForceNode3D, index: number, nodes: ForceNode3D[]) => string): LinkForce;
    distance(value: number | ((link: ForceLink3D, index: number, links: ForceLink3D[]) => number)): LinkForce;
    strength(value: number): LinkForce;
  }

  export interface CollideForce {
    radius(value: number | ((node: ForceNode3D, index: number, nodes: ForceNode3D[]) => number)): CollideForce;
    strength(value: number): CollideForce;
    iterations(value: number): CollideForce;
  }

  export interface CenterForce {
    strength(value: number): CenterForce;
  }

  export interface Simulation {
    stop(): Simulation;
    tick(iterations?: number): Simulation;
    alpha(value: number): Simulation;
    force(name: "charge", force: ManyBodyForce): Simulation;
    force(name: "link", force: LinkForce): Simulation;
    force(name: "collide", force: CollideForce): Simulation;
    force(name: "center", force: CenterForce): Simulation;
  }

  export function forceSimulation<T extends ForceNode3D>(nodes: T[], dimensions?: number): Simulation;
  export function forceManyBody(): ManyBodyForce;
  export function forceLink(links?: ForceLink3D[]): LinkForce;
  export function forceCollide(
    radius?: number | ((node: ForceNode3D, index: number, nodes: ForceNode3D[]) => number),
  ): CollideForce;
  export function forceCenter(x?: number, y?: number, z?: number): CenterForce;
}
