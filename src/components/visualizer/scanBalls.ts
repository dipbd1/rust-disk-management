import type { FileNode, SatellitePreview, ScanProgress } from "../../types/filesystem";

/** Same orbit the canvas already draws. Sixty spheres do not fit it. */
export const CANVAS_BALL_CAP = 16;
export const MOON_ARRIVE_MS = 420;
export const MOON_STAGGER_MS = 40;

export interface LiveScene {
  focus: FileNode;
  children: FileNode[];
  moons: Record<string, FileNode[]>;
}

/** Hub plus the largest children already in the scan preview. Null until a root exists. */
export function liveScanScene(progress: ScanProgress | null, placeholder: FileNode | null): LiveScene | null {
  const focus = progress?.root ?? placeholder;
  if (!focus) return null;
  return {
    focus,
    children: (progress?.topLevel ?? []).slice(0, CANVAS_BALL_CAP),
    moons: moonMap(progress?.satellites),
  };
}

export function moonMap(groups: readonly SatellitePreview[] | undefined): Record<string, FileNode[]> {
  const moons: Record<string, FileNode[]> = {};
  for (const group of groups ?? []) {
    if (group.nodes.length > 0) moons[group.parentPath] = group.nodes;
  }
  return moons;
}

/** First-seen angle among the balls on screen. A later size change does not move it. */
export function claimSlot(slots: Map<string, number>, path: string, active: readonly string[]): number {
  const existing = slots.get(path);
  if (existing !== undefined) return existing;
  const used = new Set<number>();
  for (const key of active) {
    const angle = slots.get(key);
    if (angle !== undefined) used.add(angle);
  }
  let chosen = -Math.PI / 2;
  for (let slot = 0; slot < CANVAS_BALL_CAP; slot += 1) {
    const angle = (slot / CANVAS_BALL_CAP) * Math.PI * 2 - Math.PI / 2;
    if (!used.has(angle)) {
      chosen = angle;
      break;
    }
  }
  slots.set(path, chosen);
  return chosen;
}

/** 0 until the stagger elapses, then an ease-out from the parent to the moon orbit. */
export function moonTravel(bornAt: number, now: number): number {
  const age = now - bornAt;
  if (age <= 0) return 0;
  const t = Math.min(1, age / MOON_ARRIVE_MS);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function moonBirth(born: Map<string, number>, path: string, index: number, now: number): number {
  const existing = born.get(path);
  if (existing !== undefined) return existing;
  const at = now + index * MOON_STAGGER_MS;
  born.set(path, at);
  return at;
}
