export const SPHERE_RADIUS_MIN = 0.4;
export const SPHERE_RADIUS_MAX = 3.5;

export function shareFraction(percentOfParent: number): number {
  if (!Number.isFinite(percentOfParent) || percentOfParent <= 0) return 0;
  return percentOfParent > 1 ? percentOfParent / 100 : percentOfParent;
}

export function sharePercent(percentOfParent: number): number {
  return Math.min(100, Math.max(0, shareFraction(percentOfParent) * 100));
}

/** Resting fill is clamped. Drain animations pass a lower level straight to the shader. */
export function liquidFill(percentOfParent: number, diskUsed: number | null): number {
  let fraction = shareFraction(percentOfParent);
  if (diskUsed !== null && percentOfParent <= 0) fraction = diskUsed;
  if (!Number.isFinite(fraction)) fraction = 0;
  return Math.min(0.95, Math.max(0.05, fraction));
}

export function sphereRadius(sizeBytes: number, maxBytes: number): number {
  const max = Math.max(maxBytes, 1);
  const size = Math.max(sizeBytes, 0);
  const cube = Math.cbrt(size / max);
  const log = Math.log1p(size) / Math.log1p(max);
  const t = Math.min(1, Math.max(0, cube * 0.72 + log * 0.28));
  return SPHERE_RADIUS_MIN + (SPHERE_RADIUS_MAX - SPHERE_RADIUS_MIN) * t;
}
