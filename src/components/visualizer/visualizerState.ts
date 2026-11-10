import { create } from "zustand";
import type { FileCategory } from "../../types/filesystem";

export type ViewportMode = "perspective" | "top";
export type LabelDensity = "smart" | "all" | "minimal";

interface VisualizerState {
  categoryFilter: FileCategory | "all";
  viewMode: ViewportMode;
  autoOrbit: boolean;
  labelMode: LabelDensity;
  hoveredNodeId: string | null;
  resetCameraTrigger: number;
  setCategoryFilter: (filter: FileCategory | "all") => void;
  setViewMode: (mode: ViewportMode) => void;
  toggleAutoOrbit: () => void;
  setLabelMode: (mode: LabelDensity) => void;
  setHoveredNodeId: (id: string | null) => void;
  triggerResetCamera: () => void;
}

export const useVisualizerStore = create<VisualizerState>((set) => ({
  categoryFilter: "all",
  viewMode: "perspective",
  autoOrbit: false,
  labelMode: "smart",
  hoveredNodeId: null,
  resetCameraTrigger: 0,
  setCategoryFilter: (filter) => set({ categoryFilter: filter }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleAutoOrbit: () => set((s) => ({ autoOrbit: !s.autoOrbit })),
  setLabelMode: (mode) => set({ labelMode: mode }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  triggerResetCamera: () => set((s) => ({ resetCameraTrigger: s.resetCameraTrigger + 1 })),
}));
