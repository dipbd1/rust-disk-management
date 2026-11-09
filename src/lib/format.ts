import type { DriveInfo } from "../types/filesystem";
import { sharePercent } from "./scale";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const power = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** power;
  const digits = power === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[power]}`;
}

export function formatDuration(elapsedMs: number): string {
  const seconds = Math.max(0, elapsedMs) / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

export function formatShare(percentOfParent: number, diskUsed: number | null): string {
  if (diskUsed !== null && percentOfParent <= 0) {
    return `${Math.round(diskUsed * 100)}% of disk`;
  }
  const pct = sharePercent(percentOfParent);
  const digits = pct >= 10 || pct === 0 ? 0 : 1;
  return `${pct.toFixed(digits)}% of parent`;
}

export function diskUsedRatio(drive: DriveInfo | undefined): number {
  if (!drive || drive.totalBytes <= 0) return 0;
  return Math.min(1, Math.max(0, (drive.totalBytes - drive.availableBytes) / drive.totalBytes));
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Something went wrong";
}
