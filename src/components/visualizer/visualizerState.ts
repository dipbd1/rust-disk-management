import { create } from "zustand";
import type { FileCategory } from "../../types/filesystem";

export type ViewportMode = "perspective" | "top";
export type LabelDensity = "smart" | "all" | "minimal";

export type GraphSurface = "liquid" | "map";

interface VisualizerState {
  categoryFilter: FileCategory | "all";
  surface: GraphSurface;
  viewMode: ViewportMode;
  autoOrbit: boolean;
  labelMode: LabelDensity;
  hoveredNodeId: string | null;
  resetCameraTrigger: number;
  treeRevealTrigger: number;
  centerViewTrigger: number;
  centerNodeId: string | null;
  setCategoryFilter: (filter: FileCategory | "all") => void;
  toggleSurface: () => void;
  setViewMode: (mode: ViewportMode) => void;
  toggleAutoOrbit: () => void;
  setLabelMode: (mode: LabelDensity) => void;
  setHoveredNodeId: (id: string | null) => void;
  triggerResetCamera: () => void;
  triggerTreeReveal: () => void;
  triggerCenterNode: (id: string) => void;
}

export const useVisualizerStore = create<VisualizerState>((set) => ({
  categoryFilter: "all",
  surface: "liquid",
  viewMode: "perspective",
  autoOrbit: false,
  labelMode: "smart",
  hoveredNodeId: null,
  resetCameraTrigger: 0,
  treeRevealTrigger: 0,
  centerViewTrigger: 0,
  centerNodeId: null,
  setCategoryFilter: (filter) => set({ categoryFilter: filter }),
  toggleSurface: () => set((state) => ({ surface: state.surface === "liquid" ? "map" : "liquid" })),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleAutoOrbit: () => set((s) => ({ autoOrbit: !s.autoOrbit })),
  setLabelMode: (mode) => set({ labelMode: mode }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  triggerResetCamera: () => set((s) => ({ resetCameraTrigger: s.resetCameraTrigger + 1 })),
  triggerTreeReveal: () => set((s) => ({ treeRevealTrigger: s.treeRevealTrigger + 1 })),
  triggerCenterNode: (id) => set((s) => ({ centerNodeId: id, centerViewTrigger: s.centerViewTrigger + 1 })),
}));
